from calendar import monthrange
from decimal import Decimal, InvalidOperation
from urllib.parse import urlencode

from django.conf import settings
from django.utils import timezone
from django.utils.dateparse import parse_datetime
from rest_framework.exceptions import APIException, PermissionDenied

from . import mercado_pago as mp
from .billing import billing_account
from .billing_models import CreditMovement, PlanChange, RecurringInvoice, SubscriptionPayment


OPEN_STATUSES = ('submitting', 'pending_payment', 'authorized', 'paused')
REMOTE_STATUSES = {
    'pending': 'pending_payment', 'authorized': 'authorized',
    'paused': 'paused', 'canceled': 'cancelled',
}


class SubscriptionConflict(APIException):
    status_code = 409
    default_detail = 'Cancele a assinatura ou a solicitação atual antes de contratar outro plano.'


def open_change(account):
    return account.planchange_set.filter(status__in=OPEN_STATUSES, expected_amount__isnull=False).order_by('-pk').first()


def matching_amount(value, expected):
    try:
        return expected is not None and Decimal(str(value)) == expected
    except InvalidOperation:
        return False


def validate_agreement(change, data, resource=None):
    recurring = data.get('auto_recurring')
    remote_id = mp.resource_id(data.get('id'))
    if not (
        isinstance(recurring, dict)
        and remote_id and (resource is None or remote_id == resource)
        and (not change.provider_reference or change.provider_reference == remote_id)
        and str(data.get('external_reference')) == change.external_reference
        and str(data.get('collector_id')) == settings.MP_TEST_SELLER_ID
        and recurring.get('currency_id') == 'BRL'
        and str(recurring.get('frequency')) == '1'
        and recurring.get('frequency_type') == 'months'
        and matching_amount(recurring.get('transaction_amount'), change.expected_amount)
        and isinstance(data.get('status'), str) and data['status'] in REMOTE_STATUSES
    ):
        raise mp.MercadoPagoError(error_type='invalid_subscription_response')


def save_agreement(account, change, data):
    validate_agreement(change, data)
    if change.status == 'cancelled':
        return
    version = data.get('version')
    if not isinstance(version, int) or version < 0:
        version = None
    if data['status'] != 'canceled' and change.provider_version is not None and (
        version is None or version < change.provider_version
    ):
        return
    if version is not None:
        change.provider_version = version
    change.status = REMOTE_STATUSES[data['status']]
    change.provider_reference = str(data['id'])
    link = mp.safe_checkout(data.get('init_point'))
    if link:
        change.checkout_url = link
    change.save(update_fields=['status', 'provider_reference', 'checkout_url', 'provider_version'])
    if change.status == 'cancelled' and account.paid_change_id == change.pk and account.plan_id != 'free':
        account.cancel_at_period_end = True
        account.save(update_fields=['cancel_at_period_end'])


def change_for_agreement(data):
    reference = str(data.get('external_reference', ''))
    prefix = 'promoforge-sub-'
    value = reference.removeprefix(prefix)
    if not reference.startswith(prefix) or not value.isascii() or not value.isdecimal() or len(value) > 18:
        return None
    return PlanChange.objects.filter(pk=value, expected_amount__isnull=False, provider='mercado_pago').first()


def find_submitted(change):
    offset = 0
    for _ in range(10):
        params = urlencode({'payer_email': settings.MP_TEST_BUYER_EMAIL, 'offset': offset, 'limit': 30})
        result = mp.request_mp(f'/preapproval/search?{params}')
        rows = result.get('results') or []
        for candidate in rows:
            if str(candidate.get('external_reference')) == change.external_reference:
                remote_id = mp.resource_id(candidate.get('id'))
                if not remote_id:
                    raise mp.MercadoPagoError(error_type='invalid_subscription_search_result')
                return mp.request_mp(f'/preapproval/{remote_id}')
        offset += len(rows)
        if not rows or offset >= (result.get('paging') or {}).get('total', offset):
            break
    raise SubscriptionConflict('O Mercado Pago ainda não confirmou a criação. Consulte a situação antes de tentar novamente.')


def start_checkout(user, plan):
    if not mp.configured():
        raise mp.MercadoPagoUnavailable()
    if not mp.matches_test_buyer(user):
        raise PermissionDenied('Entre na Ofertech com o e-mail da conta compradora de teste.')
    mp.verify_test_seller()
    with billing_account(user) as account:
        if account.pix_orders.filter(open=True).exists():
            raise SubscriptionConflict('Já existe uma compra Pix em andamento.')
        change = open_change(account)
        if change and (change.plan_id != plan.pk or change.status in {'authorized', 'paused'}):
            raise SubscriptionConflict()
        if change and change.status == 'pending_payment' and change.checkout_url:
            return change
        creating = change is None
        if creating:
            change = PlanChange.objects.create(
                subscription=account, plan=plan, expected_amount=plan.monthly_price, status='submitting',
            )

    if creating:
        try:
            data = mp.request_mp('/preapproval', 'POST', {
                'reason': f'Ofertech {plan.name}',
                'external_reference': change.external_reference,
                'payer_email': settings.MP_TEST_BUYER_EMAIL,
                'auto_recurring': {
                    'frequency': 1, 'frequency_type': 'months',
                    'transaction_amount': float(change.expected_amount), 'currency_id': 'BRL',
                },
                'back_url': settings.MP_BACK_URL,
                'status': 'pending',
            })
        except mp.MercadoPagoError as error:
            if error.remote_status in {400, 401, 403, 422}:
                PlanChange.objects.filter(pk=change.pk, status='submitting').update(status='failed')
            raise
    elif change.provider_reference:
        data = mp.request_mp(f'/preapproval/{change.provider_reference}')
    else:
        data = find_submitted(change)

    with billing_account(user) as account:
        change.refresh_from_db()
        save_agreement(account, change, data)
    if change.status == 'pending_payment' and not change.checkout_url:
        raise mp.MercadoPagoError(error_type='missing_valid_checkout_url')
    return change


def cancel_subscription(account):
    change = open_change(account)
    if change:
        mp.verify_test_seller()
        data = find_submitted(change) if not change.provider_reference else None
        if data:
            validate_agreement(change, data)
        remote_id = change.provider_reference or str(data['id'])
        data = mp.request_mp(f'/preapproval/{remote_id}', 'PUT', {'status': 'canceled'})
        if data.get('status') != 'canceled':
            data = mp.request_mp(f'/preapproval/{remote_id}')
        if data.get('status') != 'canceled':
            raise mp.MercadoPagoError()
        validate_agreement(change, data, remote_id)
        save_agreement(account, change, data)
    account.planchange_set.filter(expected_amount__isnull=True, status='pending_payment').update(status='cancelled')


def next_month(day, anchor):
    year = day.year + (day.month == 12)
    month = day.month % 12 + 1
    return day.replace(year=year, month=month, day=min(max(day.day, anchor), monthrange(year, month)[1]))


def process_invoice(resource, *, expected_change_id=None):
    invoice_data = mp.request_mp(f'/authorized_payments/{resource}')
    if str(invoice_data.get('id')) != resource:
        raise mp.MercadoPagoError()
    remote_id = mp.resource_id(invoice_data.get('preapproval_id'))
    if not remote_id:
        raise mp.MercadoPagoError()
    agreement = mp.request_mp(f'/preapproval/{remote_id}')
    change = change_for_agreement(agreement)
    if expected_change_id is not None and (not change or change.pk != expected_change_id):
        raise mp.MercadoPagoError(error_type='invoice_subscription_mismatch')
    if not change:
        return
    validate_agreement(change, agreement, remote_id)
    if (
        invoice_data.get('currency_id') != 'BRL'
        or not matching_amount(invoice_data.get('transaction_amount'), change.expected_amount)
    ):
        raise mp.MercadoPagoError()

    due = parse_datetime(str(invoice_data.get('debit_date', '')))
    if due is None or timezone.is_naive(due):
        raise mp.MercadoPagoError()
    due_on = timezone.localtime(due).date()
    payment_id = str((invoice_data.get('payment') or {}).get('id') or '')
    payment_data = mp.request_mp(f'/v1/payments/{payment_id}') if payment_id.isascii() and payment_id.isdecimal() and len(payment_id) <= 40 else {}
    if payment_data and (
        str(payment_data.get('id')) != payment_id
        or str(payment_data.get('collector_id')) != settings.MP_TEST_SELLER_ID
        or payment_data.get('currency_id') != 'BRL'
        or not matching_amount(payment_data.get('transaction_amount'), change.expected_amount)
    ):
        raise mp.MercadoPagoError()
    state = str(payment_data.get('status') or invoice_data.get('status') or 'pending')[:32]
    updated = parse_datetime(str(payment_data.get('date_last_updated') or ''))
    if updated is not None and timezone.is_naive(updated):
        updated = None
    confirmed = (
        payment_data.get('status') == 'approved'
        and payment_data.get('status_detail') == 'accredited'
        and matching_amount(payment_data.get('transaction_amount_refunded', 0), Decimal('0'))
    )
    if state == 'approved' and not confirmed:
        state = 'unconfirmed' if matching_amount(payment_data.get('transaction_amount_refunded', 0), Decimal('0')) else 'refund_review'

    with billing_account(change.subscription.user, refresh_allowance=False) as account:
        change.refresh_from_db()
        save_agreement(account, change, agreement)
        invoice, _ = RecurringInvoice.objects.get_or_create(
            provider_id=resource, defaults={'change': change, 'due_on': due_on, 'status': state},
        )
        if invoice.change_id != change.pk:
            raise mp.MercadoPagoError()
        if payment_data:
            payment, _ = SubscriptionPayment.objects.get_or_create(
                provider_id=payment_id, defaults={'invoice': invoice, 'status': state, 'updated_at': updated},
            )
            if payment.invoice_id != invoice.pk:
                raise mp.MercadoPagoError()
            if payment.updated_at and (not updated or updated < payment.updated_at):
                return
            payment.status, payment.updated_at = state, updated
            payment.save(update_fields=['status', 'updated_at'])
        if not invoice.applied or confirmed or state in {'refunded', 'charged_back', 'refund_review'}:
            invoice.status = state
            invoice.save(update_fields=['status'])
        if confirmed and change.status == 'authorized':
            apply_invoice(account, change, invoice)
    if confirmed and change.status in {'submitting', 'pending_payment'}:
        raise mp.MercadoPagoError()


def apply_invoice(account, change, invoice):
    today = timezone.localdate()
    first_due = change.invoices.filter(applied=True).order_by('due_on').values_list('due_on', flat=True).first()
    paid_until = next_month(invoice.due_on, first_due.day if first_due else invoice.due_on.day)
    key = f'mp:{change.pk}:{invoice.due_on:%Y-%m}'
    if (
        invoice.applied or not invoice.due_on <= today < paid_until
        or (account.paid_change_id == change.pk and account.paid_until and account.paid_until >= paid_until)
        or (account.paid_change_id and account.paid_change_id > change.pk)
        or CreditMovement.objects.filter(subscription=account, key=key).exists()
    ):
        return
    account.plan = change.plan
    account.paid_change = change
    account.paid_until = paid_until
    account.period = invoice.due_on.replace(day=1)
    account.cancel_at_period_end = False
    account.monthly_limit = change.plan.monthly_credits
    account.credits = account.monthly_limit
    account.save()
    CreditMovement.objects.create(
        subscription=account, key=key, kind='renewal', amount=account.credits, balance=account.credits,
    )
    invoice.applied = True
    invoice.save(update_fields=['applied'])


def apply_due_invoice(account, today):
    invoice = RecurringInvoice.objects.filter(
        change__subscription=account, change__status='authorized',
        due_on__lte=today, status='approved', applied=False,
    ).select_related('change__plan').order_by('-due_on').first()
    if invoice:
        apply_invoice(account, invoice.change, invoice)


def process_agreement(resource):
    agreement = mp.request_mp(f'/preapproval/{resource}')
    change = change_for_agreement(agreement)
    if change:
        validate_agreement(change, agreement, resource)
        with billing_account(change.subscription.user, refresh_allowance=False) as account:
            change.refresh_from_db()
            save_agreement(account, change, agreement)


def reconcile_subscription(change, invoice_ids=()):
    mp.verify_test_seller()
    if change.provider_reference:
        agreement = mp.request_mp(f'/preapproval/{change.provider_reference}')
    else:
        agreement = find_submitted(change)
    validate_agreement(change, agreement)
    with billing_account(change.subscription.user, refresh_allowance=False) as account:
        change.refresh_from_db()
        save_agreement(account, change, agreement)
    for invoice_id in invoice_ids:
        process_invoice(invoice_id, expected_change_id=change.pk)

