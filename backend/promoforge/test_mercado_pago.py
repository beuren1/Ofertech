from datetime import date
from io import StringIO
from hmac import new as hmac_new
from io import BytesIO
from unittest.mock import patch
from urllib.error import HTTPError

from django.contrib.auth import get_user_model
from django.core.management import call_command
from django.test import TestCase, override_settings
from rest_framework.test import APIClient

from .billing_models import CreditMovement, PlanChange, RecurringInvoice, Subscription, SubscriptionPayment
from .mercado_pago import MercadoPagoError, request_mp


@override_settings(
    MP_MODE='test',
    MP_ACCESS_TOKEN='fake-token',
    MP_TEST_SELLER_ID='123',
    MP_TEST_BUYER_EMAIL='buyer@testuser.com',
    MP_WEBHOOK_SECRET='fake-signing-secret',
    MP_BACK_URL='https://test.example.org/plans',
)
class MercadoPagoTests(TestCase):
    def setUp(self):
        self.user = get_user_model().objects.create_user(username='buyer', email='buyer@testuser.com')
        self.api = APIClient()
        self.api.force_authenticate(self.user)
        self.webhook = APIClient()
        self.today = date(2026, 11, 12)
        self.due = self.today
        self.seller_tags = ['test_user']
        self.remote_status = 'pending'
        self.payment_status = 'approved'
        self.payment_amount = 19.99
        self.payment_id = '101'
        self.cancel_error = False
        self.checkout_error = False
        self.request = self.start_patch('promoforge.mercado_pago.request_mp', side_effect=self.remote_request)
        self.start_patch('django.utils.timezone.localdate', side_effect=lambda: self.today)
        self.start_patch('promoforge.billing.current_period', side_effect=lambda: self.today.replace(day=1))

    def start_patch(self, target, **kwargs):
        patcher = patch(target, **kwargs)
        self.addCleanup(patcher.stop)
        return patcher.start()

    def agreement(self):
        change = PlanChange.objects.latest('pk')
        return {
            'id': 'test-agreement-1', 'status': self.remote_status,
            'external_reference': change.external_reference, 'collector_id': 123,
            'init_point': 'https://www.mercadopago.com.br/subscriptions/checkout?preapproval_id=test-agreement-1',
            'auto_recurring': {
                'frequency': 1, 'frequency_type': 'months',
                'transaction_amount': str(change.expected_amount), 'currency_id': 'BRL',
            },
        }

    def remote_request(self, path, method='GET', body=None, **kwargs):
        if path == '/users/me':
            return {'id': 123, 'tags': self.seller_tags}
        if path == '/preapproval' and method == 'POST':
            if self.checkout_error:
                raise MercadoPagoError()
            return self.agreement()
        if path.startswith('/preapproval/search?'):
            return {'results': [self.agreement()]}
        if path == '/preapproval/test-agreement-1':
            if method == 'PUT':
                if self.cancel_error:
                    raise MercadoPagoError()
                self.assertEqual(body, {'status': 'canceled'})
                self.remote_status = 'canceled'
            return self.agreement()
        if path.startswith('/authorized_payments/'):
            return {
                'id': path.rsplit('/', 1)[-1], 'debit_date': f'{self.due}T12:00:00-03:00',
                'preapproval_id': 'test-agreement-1', 'currency_id': 'BRL', 'transaction_amount': 19.99,
                'payment': {'id': self.payment_id, 'status': 'approved'},
            }
        if path == f'/v1/payments/{self.payment_id}':
            return {
                'id': self.payment_id, 'collector_id': 123, 'currency_id': 'BRL',
                'transaction_amount': self.payment_amount, 'status': self.payment_status,
                'status_detail': 'accredited' if self.payment_status == 'approved' else 'pending_contingency',
            }
        self.fail(f'Unexpected API call {path}')

    def checkout(self, plan='pro'):
        return self.api.post('/api/billing/change/', {'plan': plan}, format='json')

    def account(self):
        return self.api.get('/api/billing/').data

    def notify(self, resource='91', event='subscription_authorized_payment', signed=True):
        timestamp = '1790000000'
        secret = b'fake-signing-secret' if signed else b'bad-secret'
        signature = hmac_new(secret, f'id:{resource};request-id:request-1;ts:{timestamp};'.encode(), 'sha256').hexdigest()
        return self.webhook.post(
            f'/api/billing/webhooks/mercado-pago/?data.id={resource}',
            {'type': event, 'data': {'id': resource}, 'status': 'approved'},
            format='json', HTTP_X_SIGNATURE=f'ts={timestamp},v1={signature}', HTTP_X_REQUEST_ID='request-1',
        )

    def test_hosted_checkout_and_authorization_leave_free_quota_until_payment(self):
        for _ in range(2):
            result = self.checkout()
            self.assertEqual(result.status_code, 202, result.data)
            self.assertIn('/subscriptions/checkout', result.data['checkout_url'])
        calls = [call for call in self.request.call_args_list if call.args[:2] == ('/preapproval', 'POST')]
        self.assertEqual(len(calls), 1)
        self.assertEqual(calls[0].args[2]['auto_recurring']['transaction_amount'], 19.99)
        self.assertEqual(calls[0].args[2]['status'], 'pending')
        self.assertEqual(self.checkout('business').status_code, 409)
        self.remote_status = 'authorized'
        self.assertEqual(self.notify('test-agreement-1', 'subscription_preapproval').status_code, 200)
        self.assertEqual(self.account()['subscription_status'], 'authorized')
        self.assertEqual(self.account()['credits'], 10)

    @override_settings(MP_MODE='off')
    def test_checkout_disabled_in_off_mode(self):
        self.assertFalse(self.account()['checkout_available'])
        self.assertEqual(self.account()['checkout_blockers'], ['mode_disabled'])
        self.assertEqual(self.checkout().status_code, 503)
        self.request.assert_not_called()

    def test_reconciliation_is_local_by_default_and_replays_without_a_second_renewal(self):
        self.assertEqual(self.checkout().status_code, 202)
        change = PlanChange.objects.latest('pk')
        self.request.reset_mock()
        output = StringIO()
        call_command('reconcile_subscription', change.pk, '--invoice', '91', stdout=output)
        self.request.assert_not_called()
        self.assertIn('Consulta local', output.getvalue())
        self.remote_status = 'authorized'
        for _ in range(2):
            call_command('reconcile_subscription', change.pk, '--invoice', '91', '--apply', stdout=output)
        self.assertTrue(RecurringInvoice.objects.get(pk='91').applied)
        self.assertEqual(CreditMovement.objects.filter(key__startswith='mp:').count(), 1)
        self.assertTrue(all(len(call.args) == 1 or call.args[1] == 'GET' for call in self.request.call_args_list))

    def test_signed_payment_update_records_refund_without_issuing_more_credits(self):
        self.assertEqual(self.checkout().status_code, 202)
        self.remote_status = 'authorized'
        self.assertEqual(self.notify().status_code, 200)
        self.payment_status = 'refunded'
        self.assertEqual(self.notify(self.payment_id, 'payment', signed=False).status_code, 401)
        self.assertEqual(self.notify(self.payment_id, 'payment').status_code, 200)
        self.assertEqual(RecurringInvoice.objects.get(pk='91').status, 'refunded')
        self.assertEqual(CreditMovement.objects.filter(key__startswith='mp:').count(), 1)

    def test_recovers_checkout_after_an_uncertain_provider_response(self):
        self.checkout_error = True
        self.assertEqual(self.checkout().status_code, 502)
        self.assertEqual(self.account()['subscription_status'], 'submitting')
        self.checkout_error = False
        self.assertEqual(self.checkout().status_code, 202)
        self.assertEqual(sum(call.args[:2] == ('/preapproval', 'POST') for call in self.request.call_args_list), 1)
        self.assertEqual(PlanChange.objects.count(), 1)

    def test_upstream_error_logs_only_safe_diagnostics(self):
        cases = (
            (b'{"error":"bad_request","message":"private-details"}', 'bad_request'),
            (b'{"error":"private-details","code":"private-details"}', 'upstream_http_error'),
            (b'not-json-private-details', 'upstream_http_error'),
        )
        for body, error_type in cases:
            error = HTTPError('https://api.mercadopago.com/preapproval', 400, 'private-details', {}, BytesIO(body))
            with self.subTest(error_type=error_type), patch('promoforge.mercado_pago.build_opener') as opener:
                opener.return_value.open.side_effect = error
                with self.assertLogs('promoforge.mercado_pago', level='WARNING') as logs:
                    with self.assertRaises(MercadoPagoError) as raised:
                        request_mp('/preapproval', 'POST', {'payer_email': 'private-details'})
                self.assertEqual(raised.exception.remote_status, 400)
                self.assertEqual(logs.records[0].getMessage(), f'Mercado Pago: operation=create_subscription http_status=400 error_type={error_type}')

    def test_refuses_a_seller_without_test_identity(self):
        self.seller_tags = ['normal']
        self.assertEqual(self.checkout().status_code, 503)
        self.assertFalse(PlanChange.objects.exists())
        self.request.assert_called_once_with('/users/me', identity=True)

    def test_approved_payment_and_retries_grant_only_once_per_cycle(self):
        self.assertEqual(self.checkout().status_code, 202)
        self.remote_status = 'authorized'
        self.assertEqual(self.notify().status_code, 200)
        self.assertEqual(self.account()['credits'], 200)
        self.assertEqual(self.account()['plan']['code'], 'pro')
        Subscription.objects.filter(user=self.user).update(credits=190)
        self.assertEqual(self.notify().status_code, 200)
        self.payment_id = '102'
        self.assertEqual(self.notify('92').status_code, 200)
        self.assertEqual(self.account()['credits'], 190)
        self.assertEqual(CreditMovement.objects.filter(key__startswith='mp:').count(), 1)
        self.assertEqual(RecurringInvoice.objects.count(), 2)
        self.assertEqual(SubscriptionPayment.objects.count(), 2)

        self.today = date(2026, 12, 4)
        self.assertEqual(self.account()['credits'], 190)
        self.today = self.due = date(2026, 12, 12)
        self.payment_id = '103'
        self.assertEqual(self.notify('93').status_code, 200)
        self.assertEqual(self.account()['credits'], 200)
        self.assertEqual(CreditMovement.objects.filter(key__startswith='mp:').count(), 2)

    def test_pending_rejected_cancelled_and_late_payments(self):
        self.assertEqual(self.checkout().status_code, 202)
        self.remote_status = 'authorized'
        self.today = date(2026, 11, 15)
        for status in ('pending', 'rejected', 'cancelled'):
            self.payment_status = status
            self.assertEqual(self.notify().status_code, 200)
            self.assertEqual(self.account()['payment_status'], status)
            self.assertTrue(self.account()['payment_overdue'])
            self.assertEqual(self.account()['credits'], 10)
        self.payment_status = 'approved'
        self.assertEqual(self.notify().status_code, 200)
        self.assertEqual(self.account()['credits'], 200)
        self.assertEqual(self.account()['paid_until'], date(2026, 12, 12))

    def test_invalid_signature_and_wrong_amount_cannot_grant_access(self):
        self.assertEqual(self.checkout().status_code, 202)
        self.remote_status = 'authorized'
        self.request.reset_mock()
        self.assertEqual(self.notify(signed=False).status_code, 401)
        self.request.assert_not_called()
        self.payment_amount = 1
        self.assertEqual(self.notify().status_code, 502)
        self.assertEqual(self.account()['credits'], 10)

    def test_early_approval_is_applied_when_the_cycle_begins(self):
        self.assertEqual(self.checkout().status_code, 202)
        self.remote_status = 'authorized'
        self.due = date(2026, 11, 13)
        self.assertEqual(self.notify().status_code, 200)
        self.assertEqual(self.account()['credits'], 10)
        self.today = self.due
        self.assertEqual(self.account()['credits'], 200)
        self.assertEqual(self.account()['credits'], 200)
        self.assertEqual(CreditMovement.objects.filter(key__startswith='mp:').count(), 1)

    def test_cancel_stops_renewal_and_keeps_paid_access_until_expiry(self):
        self.assertEqual(self.checkout().status_code, 202)
        self.remote_status = 'authorized'
        self.assertEqual(self.notify().status_code, 200)
        self.cancel_error = True
        self.assertEqual(self.checkout('free').status_code, 502)
        self.assertEqual(self.account()['subscription_status'], 'authorized')
        self.cancel_error = False
        self.assertEqual(self.checkout('free').status_code, 200)
        self.assertEqual(self.checkout('free').status_code, 200)
        self.assertEqual(self.account()['subscription_status'], 'cancelled')
        self.assertTrue(self.account()['cancel_at_period_end'])
        self.assertEqual(self.account()['credits'], 200)
        self.today = self.due = date(2026, 12, 12)
        self.payment_id = '109'
        self.assertEqual(self.notify('99').status_code, 200)
        self.assertEqual(self.account()['plan']['code'], 'free')
        self.assertEqual(self.account()['credits'], 10)

    def test_failed_renewal_falls_back_to_free_and_can_recover_after_payment(self):
        self.assertEqual(self.checkout().status_code, 202)
        self.remote_status = 'authorized'
        self.assertEqual(self.notify().status_code, 200)
        self.today = date(2026, 12, 14)
        self.due = date(2026, 12, 12)
        self.payment_id = '105'
        self.payment_status = 'rejected'
        self.assertEqual(self.notify('95').status_code, 200)
        self.assertEqual(self.account()['credits'], 10)
        self.assertTrue(self.account()['payment_overdue'])
        self.payment_status = 'approved'
        self.assertEqual(self.notify('95').status_code, 200)
        self.assertEqual(self.account()['credits'], 200)
        self.assertFalse(self.account()['payment_overdue'])

