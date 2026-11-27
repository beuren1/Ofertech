import re
from datetime import timedelta
from decimal import Decimal, InvalidOperation
from uuid import NAMESPACE_URL, UUID, uuid5

from django.conf import settings
from django.utils import timezone
from django.utils.crypto import constant_time_compare, salted_hmac
from django.utils.dateparse import parse_datetime
from rest_framework import serializers
from rest_framework.exceptions import APIException, ValidationError

from . import asaas
from .billing import billing_account, plan_data
from .billing_models import CreditMovement, PixOrder, PixWebhookEvent
from .recurring import open_change


PERIOD = timedelta(days=30)
REFERENCE_PREFIX = 'ofertech-pix-'
REMOTE_STATES = {
    'PENDING': 'waiting',
    'OVERDUE': 'expired',
    'RECEIVED': 'approved',
    'REFUNDED': 'refunded',
    'REFUND_REQUESTED': 'refund_review',
    'REFUND_IN_PROGRESS': 'refund_review',
    'PARTIALLY_REFUNDED': 'refund_review',
    'CHARGEBACK_REQUESTED': 'refund_review',
    'CHARGEBACK_DISPUTE': 'refund_review',
    'CANCELLED': 'cancelled',
    'CANCELED': 'cancelled',
    'REJECTED': 'rejected',
}
CLOSED_STATES = {'approved', 'refunded', 'cancelled', 'rejected'}


class PixConflict(APIException):
    status_code = 409
    default_detail = 'Já existe uma compra Pix em andamento. Abra o pedido existente para continuar.'


class PixInput(serializers.Serializer):
    key = serializers.UUIDField()
    plan = serializers.ChoiceField(choices=('pro', 'business'))
    name = serializers.CharField(max_length=100, required=False)
    document = serializers.CharField(max_length=18, required=False)

    def validate_document(self, value):
        document = re.sub(r'[./ -]', '', value).upper()
        if not re.fullmatch(r'[0-9]{11}|[A-Z0-9]{12}[0-9]{2}', document) or len(set(document)) == 1:
            raise serializers.ValidationError('Informe um CPF ou CNPJ válido.')
        return document


def legacy_paid(account):
    return bool(account.paid_change_id and account.paid_until and account.paid_until > timezone.localdate())


def order_id_for(user, key):
    scope = 'ofertech/pix/production' if settings.ASAAS_ENVIRONMENT == 'production' else 'ofertech/pix'
    return uuid5(NAMESPACE_URL, f'{scope}/{user.pk}/{key}')


def customer_for(account, data):
    environment = settings.ASAAS_ENVIRONMENT
    known = account.pix_orders.filter(environment=environment).order_by('-created_at').values_list('customer_id', flat=True).first()
    if known:
        return known
    if not data.get('name') or not data.get('document'):
        raise ValidationError('Informe o nome e o CPF ou CNPJ do pagador.')
    salt = 'asaas-customer-production' if environment == 'production' else 'asaas-customer'
    reference = 'ofertech-customer-' + salted_hmac(salt, str(account.user_id)).hexdigest()
    customer = asaas.find_by_reference('/customers', reference)
    creating = customer is None
    if creating:
        try:
            customer = asaas.request('/customers', 'POST', {
                'name': data['name'], 'cpfCnpj': data['document'],
                'externalReference': reference, 'notificationDisabled': True,
            })
        except asaas.AsaasError as error:
            if error.remote_status in {400, 422}:
                raise ValidationError('O Asaas recusou os dados do pagador. Confira o nome e o CPF ou CNPJ.') from None
            raise
    customer_id = customer.get('id')
    if not asaas.resource_id(customer_id, 'cus') or customer.get('externalReference') != reference:
        asaas.log_failure('POST /customers' if creating else 'GET /customers', 'unexpected_customer')
        raise asaas.AsaasError()
    return customer_id


def start_order(user, plan, data):
    if not asaas.enabled():
        raise asaas.AsaasUnavailable()
    with billing_account(user) as account:
        environment = settings.ASAAS_ENVIRONMENT
        orders = account.pix_orders.filter(environment=environment)
        order_id = order_id_for(user, data['key'])
        existing = orders.filter(pk=order_id).first() or orders.filter(open=True).first()
        if existing:
            if existing.plan_id == plan.pk:
                return existing
            raise PixConflict()
        if open_change(account) or legacy_paid(account):
            raise PixConflict('A conta tem uma assinatura, uma solicitação ou um período pago do Mercado Pago em vigor.')
        order = account.pix_orders.create(
            id=order_id, plan=plan, amount=plan.monthly_price, credits=plan.monthly_credits,
            customer_id=customer_for(account, data), environment=environment,
            due_on=timezone.localdate() + timedelta(days=1 if environment == 'production' else 0),
        )
    # The order is durable before the only POST. An ambiguous failure can be
    # reconciled by external reference without sending a second charge request.
    try:
        payment = asaas.request('/payments', 'POST', {
            'customer': order.customer_id, 'billingType': 'PIX', 'value': float(order.amount),
            'dueDate': order.due_on.isoformat(), 'externalReference': order.reference,
            'description': f'Ofertech {plan.name} - 30 dias',
            'interest': {'value': 0}, 'fine': {'value': 0}, 'discount': {'value': 0},
        })
    except asaas.AsaasError as error:
        if error.remote_status in {400, 401, 403, 422}:
            PixOrder.objects.filter(pk=order.pk, payment_id__isnull=True).update(status='rejected', open=False)
        return PixOrder.objects.get(pk=order.pk)
    try:
        validate_payment(order, payment, payment.get('id'))
    except asaas.AsaasError:
        asaas.log_failure('POST /payments', 'unexpected_payment')
        return PixOrder.objects.get(pk=order.pk)
    with billing_account(user, refresh_allowance=False) as account:
        order.refresh_from_db()
        if order.payment_id is None:
            order.payment_id = payment['id']
            order.status = 'waiting' if payment.get('status') == 'PENDING' else 'processing'
            order.save(update_fields=['payment_id', 'status'])
    return order


def validate_payment(order, payment, payment_id):
    try:
        amount = Decimal(str(payment.get('value')))
        original = payment.get('originalValue')
        exact_amount = amount == order.amount and (original is None or Decimal(str(original)) == order.amount)
    except InvalidOperation:
        exact_amount = False
    if not (
        asaas.resource_id(payment_id, 'pay') and payment.get('id') == payment_id
        and order.payment_id in (None, payment_id)
        and payment.get('externalReference') == order.reference
        and payment.get('customer') == order.customer_id
        and payment.get('billingType') == 'PIX'
        # The Asaas domestic Pix endpoint uses BRL and may omit currency.
        and payment.get('currency', 'BRL') == 'BRL' and payment.get('currencyId', 'BRL') == 'BRL'
        and exact_amount
    ):
        raise asaas.AsaasError()


def payment_status(payment, amount):
    if payment.get('deleted') is True:
        return 'cancelled'
    status = REMOTE_STATES.get(str(payment.get('status')), 'processing')
    refunds = payment.get('refunds')
    if status == 'refunded' or not refunds:
        return status
    if not isinstance(refunds, list) or any(not isinstance(item, dict) for item in refunds):
        raise asaas.AsaasError()
    try:
        returned = sum(Decimal(str(item.get('value'))) for item in refunds if item.get('status') == 'DONE')
        if returned < 0 or returned > amount:
            raise ValueError()
    except (InvalidOperation, ValueError):
        raise asaas.AsaasError() from None
    if returned == amount:
        return 'refunded'
    if any(item.get('status') != 'CANCELLED' for item in refunds):
        return 'refund_review'
    return status


def activate(account, order):
    today = timezone.localdate()
    if (
        account.paid_pix_order_id and account.paid_pix_order.environment == order.environment
        and account.plan_id == order.plan_id and account.paid_until and account.paid_until > today
    ):
        starts = account.paid_until
    else:
        starts = today
    order.paid_until = starts + PERIOD
    account.plan_id = order.plan_id
    account.paid_until = order.paid_until
    account.paid_change = None
    account.paid_pix_order = order
    account.cancel_at_period_end = False
    account.period = today.replace(day=1)
    account.monthly_limit = order.credits
    account.credits += order.credits
    account.save()
    CreditMovement.objects.create(
        subscription=account, key=f'pix:{order.pk}', kind='renewal',
        amount=order.credits, balance=account.credits,
    )


def remaining_grant(history, grant):
    # Spend the newest balance first and reverse only the remainder of the
    # refunded purchase. Credits from earlier purchases stay in the account.
    balances = {grant.key: grant.amount}
    for movement in history.filter(pk__gt=grant.pk).order_by('pk'):
        if movement.kind == 'pix_expiration' or (
            movement.kind == 'renewal' and not movement.key.startswith('pix:')
        ):
            return 0
        if movement.kind == 'pix_refund':
            target = 'pix:' + movement.key.removeprefix('pix-refund:')
            balances.pop(target, None)
        elif movement.amount > 0:
            balances[movement.key] = movement.amount
        elif movement.amount < 0:
            spent = -movement.amount
            for key in reversed(balances):
                used = min(balances[key], spent)
                balances[key] -= used
                spent -= used
                if not spent:
                    break
        if not balances.get(grant.key):
            return 0
    return balances[grant.key]


def reverse(account, order):
    history = CreditMovement.objects.filter(subscription=account)
    grant = history.filter(key=f'pix:{order.pk}').first()
    refund_key = f'pix-refund:{order.pk}'
    if not grant or history.filter(key=refund_key).exists():
        return
    amount = min(account.credits, remaining_grant(history, grant))
    account.credits -= amount
    if account.paid_pix_order_id == order.pk:
        previous = None
        eligible = {f'pix:{item.pk}': item for item in account.pix_orders.filter(
            environment=order.environment, status='approved', paid_until__gt=timezone.localdate(),
        ).exclude(pk=order.pk)}
        for grant_key in history.filter(pk__lt=grant.pk, key__startswith='pix:').order_by('-pk').values_list('key', flat=True):
            if grant_key in eligible:
                previous = eligible[grant_key]
                break
        account.plan_id = previous.plan_id if previous else 'free'
        account.paid_until = previous.paid_until if previous else None
        account.paid_pix_order = previous
        account.monthly_limit = previous.credits if previous else account.plan.monthly_credits
    account.save(update_fields=['credits', 'plan', 'paid_until', 'monthly_limit', 'paid_pix_order'])
    CreditMovement.objects.create(
        subscription=account, key=refund_key, kind='pix_refund', amount=-amount, balance=account.credits,
    )


def reconcile(order, *, event_id=None, payment_id=None, cancel=False):
    if order.environment != settings.ASAAS_ENVIRONMENT:
        raise asaas.AsaasUnavailable()
    event_key = f'{order.environment}:{event_id}' if event_id else None
    # Serialize the provider read and local writes for this account so two
    # workers cannot apply provider snapshots in reverse order.
    with billing_account(order.subscription.user) as account:
        order.refresh_from_db()
        if event_key and PixWebhookEvent.objects.filter(pk=event_key).exists():
            return order
        remote_id = payment_id or order.payment_id
        if not remote_id:
            if not order.open:
                return order
            recovered = asaas.find_by_reference('/payments', order.reference)
            if recovered is None:
                return order
            remote_id = recovered.get('id')
        if not asaas.resource_id(remote_id, 'pay'):
            raise asaas.AsaasError()
        path = f'/payments/{remote_id}'
        payment = asaas.request(path)
        validate_payment(order, payment, remote_id)
        if cancel and payment.get('status') in {'PENDING', 'OVERDUE'} and payment.get('deleted') is not True:
            deletion = asaas.request(path, 'DELETE')
            if deletion.get('deleted') is not True or deletion.get('id') != remote_id:
                raise asaas.AsaasError()
            payment['deleted'] = True
        status = payment_status(payment, order.amount)
        if order.status == 'refunded':
            status = 'refunded'
        if status == 'approved' and order.paid_until is None:
            activate(account, order)
        elif status == 'refunded':
            reverse(account, order)
        order.payment_id = remote_id
        order.status = status
        order.open = order.open and status not in CLOSED_STATES
        order.save(update_fields=['payment_id', 'status', 'open', 'paid_until'])
        if event_key:
            PixWebhookEvent.objects.get_or_create(pk=event_key, defaults={'order': order})
        return order


def webhook_order(payment):
    remote_id = payment.get('id')
    if not asaas.resource_id(remote_id, 'pay'):
        return None
    environment = settings.ASAAS_ENVIRONMENT
    orders = PixOrder.objects.filter(environment=environment)
    order = orders.filter(payment_id=remote_id).first()
    reference = payment.get('externalReference')
    prefix = 'ofertech-pix-prod-' if environment == 'production' else REFERENCE_PREFIX
    if order or not isinstance(reference, str) or not reference.startswith(prefix):
        return order
    try:
        key = UUID(reference.removeprefix(prefix))
    except ValueError:
        return None
    return orders.filter(pk=key, payment_id__isnull=True, open=True).first()


def verify_token(token, environment):
    return (
        environment == settings.ASAAS_ENVIRONMENT and asaas.configured()
        and constant_time_compare(token, asaas.credentials()[1])
    )


def order_data(order):
    qr_expired = order.qr_expires_at and order.qr_expires_at <= timezone.now()
    overdue = order.environment == 'production' and timezone.localdate() > order.due_on
    return {
        'id': order.pk, 'plan': plan_data(order.plan), 'amount': str(order.amount), 'currency': 'BRL',
        'environment': order.environment,
        'status': 'expired' if order.status == 'waiting' and (qr_expired or overdue) else order.status,
        'due_on': order.due_on, 'qr_expires_at': order.qr_expires_at, 'paid_until': order.paid_until,
        'can_cancel': order.open and order.status in {'waiting', 'expired'},
        'open': order.open,
    }


def invoice_fallback(order, path):
    payment = asaas.request(path)
    validate_payment(order, payment, order.payment_id)
    if payment_status(payment, order.amount) != 'waiting':
        raise PixConflict('Esta cobrança não está aguardando um pagamento Pix. Consulte a situação do pedido.')
    url = asaas.invoice_url(payment.get('invoiceUrl'), order.environment)
    if url is None:
        asaas.log_failure('GET /payments/{id}', 'invalid_invoice_url')
        raise asaas.AsaasError()
    return {'invoice_url': url}


def get_qr(order):
    if order.environment != settings.ASAAS_ENVIRONMENT:
        raise asaas.AsaasUnavailable()
    if not order.open or order_data(order)['status'] != 'waiting' or not asaas.resource_id(order.payment_id, 'pay'):
        raise PixConflict('Esta cobrança não está aguardando um pagamento Pix.')
    path = f'/payments/{order.payment_id}'
    try:
        qr = asaas.request(f'{path}/pixQrCode')
    except asaas.AsaasError:
        return invoice_fallback(order, path)
    try:
        expires = parse_datetime(qr['expirationDate'])
        image = qr['encodedImage']
        payload = qr['payload']
        if expires is None or not re.fullmatch(r'[A-Za-z0-9+/=]{1,250000}', image) or not isinstance(payload, str) or not 1 <= len(payload) <= 2048:
            raise ValueError()
    except (KeyError, TypeError, ValueError):
        asaas.log_failure('GET /payments/{id}/pixQrCode', 'invalid_qr_data')
        return invoice_fallback(order, path)
    if timezone.is_naive(expires):
        expires = timezone.make_aware(expires, timezone.get_default_timezone())
    PixOrder.objects.filter(pk=order.pk, status='waiting').update(qr_expires_at=expires)
    if expires <= timezone.now():
        raise PixConflict('Este QR Code expirou. Cancele a cobrança antes de criar outra.')
    return {'encoded_image': image, 'payload': payload, 'expires_at': expires}
