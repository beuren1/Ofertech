import json
from datetime import timedelta
from io import BytesIO
from unittest.mock import patch
from urllib.error import HTTPError, URLError
from uuid import uuid4

from django.contrib.auth import get_user_model
from django.test import TestCase, override_settings
from django.utils import timezone
from rest_framework.test import APIClient

from . import asaas
from .billing_models import CreditMovement, PixOrder, PixWebhookEvent, PlanChange, Subscription
from .pix_billing import order_id_for


TOKEN = 'webhook-secret-used-in-tests-only-123'
WEBHOOK = '/api/billing/webhooks/asaas/'


@override_settings(ASAAS_ENVIRONMENT='sandbox', ASAAS_API_KEY='sandbox-key', ASAAS_WEBHOOK_TOKEN=TOKEN)
class PixCheckoutTests(TestCase):
    def setUp(self):
        self.user = get_user_model().objects.create_user(username='pix-buyer')
        self.client = APIClient()
        self.client.force_authenticate(user=self.user)
        self.key = uuid4()
        self.remote = {}
        self.error = None
        self.reject = False
        self.simulate_timeout = False
        self.qr_error = None
        self.stub = patch('promoforge.asaas.request', side_effect=self.provider)
        self.remote_calls = self.stub.start()
        self.addCleanup(self.stub.stop)

    def provider(self, path, method='GET', data=None, *, query=None):
        if self.error:
            raise self.error
        if path == '/customers':
            if method == 'POST':
                self.assertEqual(data['cpfCnpj'], '24971563792')
                return {'id': 'cus_test', 'externalReference': data['externalReference']}
            return {'data': []}
        if path == '/payments':
            if method == 'GET':
                return {'data': [item for item in self.remote.values() if item['externalReference'] == query['externalReference']]}
            if self.reject:
                raise asaas.AsaasError(400)
            payment = {'id': f'pay_{len(self.remote) + 1}', 'status': 'PENDING', **data}
            self.remote[payment['id']] = payment
            if self.simulate_timeout:
                raise asaas.AsaasError()
            return payment.copy()
        payment = self.remote[path.split('/')[2]]
        if method == 'DELETE':
            payment['deleted'] = True
            return {'id': payment['id'], 'deleted': True}
        if path.endswith('/pixQrCode'):
            if self.qr_error:
                raise self.qr_error
            return {
                'encodedImage': 'YWJj', 'payload': 'pix-copia-e-cola',
                'expirationDate': (timezone.now() + timedelta(hours=1)).isoformat(),
            }
        return payment.copy()

    def create(self, plan='pro', *, key=None):
        return self.client.post('/api/billing/pix/', {
            'plan': plan, 'key': str(key or self.key), 'name': 'Comprador de Teste',
            'document': '249.715.637-92', 'amount': '0.01',
        }, format='json')

    def path(self, action=''):
        return f'/api/billing/pix/{self.order_id}/{action}'

    @property
    def order_id(self):
        return order_id_for(self.user, self.key)

    def hook(self, event='PAYMENT_RECEIVED', event_id=None, token=TOKEN, payment_id='pay_1'):
        payment = self.remote[payment_id]
        return self.client.post(WEBHOOK, {
            'id': event_id or f'evt_{uuid4()}', 'event': event,
            'payment': {**payment, 'status': 'RECEIVED'},
        }, format='json', HTTP_ASAAS_ACCESS_TOKEN=token)

    def account(self):
        return Subscription.objects.get(user=self.user)

    def test_create_pix_returns_backend_price_qr_and_reuses_one_open_order(self):
        response = self.create()
        self.assertEqual(response.status_code, 202, response.data)
        self.assertEqual(response.data['amount'], '19.99')
        self.assertEqual(response.data['status'], 'waiting')
        self.assertEqual(self.remote['pay_1']['billingType'], 'PIX')
        self.assertEqual(self.remote['pay_1']['value'], 19.99)
        for key in (self.key, uuid4()):
            self.assertEqual(self.create(key=key).data['id'], self.order_id)
        self.assertEqual(self.create('business', key=uuid4()).status_code, 409)
        self.assertEqual(len(self.remote), 1)
        qr = self.client.post(self.path('qr/'))
        self.assertEqual(qr.status_code, 200)
        self.assertEqual(qr.data['payload'], 'pix-copia-e-cola')
        self.assertEqual(qr.data['encoded_image'], 'YWJj')
        self.assertIsNotNone(PixOrder.objects.get(pk=self.order_id).qr_expires_at)

    def test_qr_400_falls_back_to_the_verified_pending_invoice(self):
        self.create()
        self.qr_error = asaas.AsaasError(400)
        invoice = 'https://sandbox.asaas.com/i/123456789'
        self.remote['pay_1']['invoiceUrl'] = invoice
        response = self.client.post(self.path('qr/'), {'invoice_url': 'https://example.test'}, format='json')
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data, {'invoice_url': invoice})
        self.assertEqual(self.remote_calls.call_args_list[-2].args, ('/payments/pay_1/pixQrCode',))
        self.assertEqual(self.remote_calls.call_args.args, ('/payments/pay_1',))
        self.assertEqual(self.account().plan_id, 'free')
        self.assertEqual(self.account().credits, 10)
        self.assertIsNone(PixOrder.objects.get(pk=self.order_id).qr_expires_at)
        self.assertEqual(len(self.remote), 1)

    @patch('promoforge.pix_views.take_or_throttle')
    def test_invoice_fallback_rejects_untrusted_links_and_mismatched_payments(self, _throttle):
        self.create()
        self.qr_error = asaas.AsaasError(400)
        payment = self.remote['pay_1']
        for url in (
            None, 'http://sandbox.asaas.com/i/test', 'https://www.asaas.com/i/test',
            'https://sandbox.asaas.com.evil.test/i/test', 'https://sandbox.asaas.com@evil.test/i/test',
            'https://evil.test@sandbox.asaas.com/i/test', 'https://sandbox.asaas.com:443/i/test',
            'https://sandbox.asaas.com/i/test?redirect=https://evil.test',
            'https://sandbox.asaas.com/i/%2e%2e', 'https://sandbox.asaas.com/redirect/test',
        ):
            with self.subTest(url=url):
                payment['invoiceUrl'] = url
                response = self.client.post(self.path('qr/'))
                self.assertEqual(response.status_code, 502)
                self.assertNotIn('invoice_url', response.data)
        payment['invoiceUrl'] = 'https://sandbox.asaas.com/i/test'
        for field, value in (('customer', 'cus_other'), ('value', '39.99'), ('externalReference', 'other'), ('billingType', 'BOLETO')):
            with self.subTest(field=field):
                old = payment[field]
                payment[field] = value
                self.assertEqual(self.client.post(self.path('qr/')).status_code, 502)
                payment[field] = old
        payment['status'] = 'RECEIVED'
        self.assertEqual(self.client.post(self.path('qr/')).status_code, 409)
        self.assertEqual(self.account().credits, 10)

    def test_waits_during_cautionary_block_and_applies_only_once_even_out_of_order(self):
        self.create()
        self.assertEqual(self.hook(token='forged').status_code, 401)
        self.assertEqual(self.hook().status_code, 200)
        self.assertEqual(self.account().plan_id, 'free')
        self.remote['pay_1']['status'] = 'CONFIRMED'
        self.hook(event='PAYMENT_CONFIRMED')
        self.assertEqual(self.client.get(self.path()).data['status'], 'processing')
        self.assertEqual(self.account().credits, 10)
        self.remote['pay_1']['status'] = 'RECEIVED'
        self.assertEqual(self.hook(event_id='evt_paid').status_code, 200)
        calls = self.remote_calls.call_count
        self.assertEqual(self.hook(event_id='evt_paid').status_code, 200)
        self.assertEqual(self.remote_calls.call_count, calls)
        self.assertEqual(self.hook(event='PAYMENT_CREATED').status_code, 200)
        self.assertEqual(self.account().plan_id, 'pro')
        self.assertEqual(self.account().credits, 210)
        self.assertEqual(self.account().paid_until, timezone.localdate() + timedelta(days=30))
        self.assertEqual(CreditMovement.objects.filter(key=f'pix:{self.order_id}').count(), 1)
        self.assertEqual(PixWebhookEvent.objects.filter(pk='sandbox:evt_paid').count(), 1)
        self.assertEqual(self.create().data['id'], self.order_id)

    def test_rejects_inconsistent_provider_response(self):
        self.create()
        payment = self.remote['pay_1']
        payment['status'] = 'RECEIVED'
        for field, wrong in [('value', '19.98'), ('originalValue', '5.00'), ('customer', 'cus_other'),
                             ('billingType', 'BOLETO'), ('currency', 'USD'), ('externalReference', 'wrong'),
                             ('id', 'pay_wrong')]:
            with self.subTest(field=field):
                old = payment.copy()
                payment[field] = wrong
                self.remote['pay_1'] = payment
                # The notification's id may match while the fetched object differs.
                response = self.client.post(WEBHOOK, {
                    'id': 'evt_bad', 'event': 'PAYMENT_RECEIVED', 'payment': {'id': 'pay_1'},
                }, format='json', HTTP_ASAAS_ACCESS_TOKEN=TOKEN)
                self.assertEqual(response.status_code, 502)
                payment = self.remote['pay_1'] = old
        self.assertEqual(self.account().credits, 10)
        self.assertFalse(PixWebhookEvent.objects.exists())

    def test_order_actions_require_the_owner(self):
        self.create()
        self.client.force_authenticate(user=None)
        self.assertEqual(self.client.get(self.path()).status_code, 401)
        self.client.force_authenticate(user=get_user_model().objects.create_user(username='other'))
        self.assertEqual(self.client.get(self.path()).status_code, 404)
        for action in ('refresh/', 'qr/', 'cancel/'):
            self.assertEqual(self.client.post(self.path(action)).status_code, 404)
        other_order = self.create()
        self.assertEqual(other_order.status_code, 202)
        self.assertNotEqual(other_order.data['id'], self.order_id)

    def test_rejection_expiration_cancellation_and_new_order(self):
        self.reject = True
        self.assertEqual(self.create().data['status'], 'rejected')
        self.assertEqual(self.account().credits, 10)
        self.reject = False
        self.key = uuid4()
        self.create()
        self.remote['pay_1']['status'] = 'OVERDUE'
        self.assertEqual(self.client.post(self.path('refresh/')).data['status'], 'expired')
        self.assertEqual(self.create(key=uuid4()).data['id'], self.order_id)
        self.assertEqual(self.client.post(self.path('cancel/')).data['status'], 'cancelled')
        self.assertEqual(self.hook(event='PAYMENT_DELETED').status_code, 200)
        new_key = uuid4()
        self.assertEqual(self.create('business', key=new_key).data['id'], order_id_for(self.user, new_key))
        self.assertEqual(self.remote['pay_2']['value'], 39.99)
        self.assertEqual(self.account().plan_id, 'free')

    def test_refund_and_delayed_confirmation_do_not_award_again(self):
        self.create()
        self.remote['pay_1']['status'] = 'RECEIVED'
        self.hook()
        account = self.account()
        account.credits -= 30
        account.save(update_fields=['credits'])
        CreditMovement.objects.create(subscription=account, key='spent', kind='generation', amount=-30, balance=account.credits)
        self.remote['pay_1']['status'] = 'REFUND_IN_PROGRESS'
        self.hook(event='PAYMENT_REFUND_IN_PROGRESS')
        self.assertEqual(self.client.get(self.path()).data['status'], 'refund_review')
        self.remote['pay_1']['status'] = 'REFUNDED'
        self.hook(event='PAYMENT_REFUNDED')
        self.hook()
        self.assertEqual(self.account().credits, 10)
        self.assertEqual(self.account().plan_id, 'free')
        self.assertEqual(CreditMovement.objects.get(key=f'pix-refund:{self.order_id}').amount, -170)

    def test_cautionary_block_can_go_directly_to_refunded(self):
        self.create()
        self.remote['pay_1']['status'] = 'CONFIRMED'
        self.hook(event='PAYMENT_CONFIRMED')
        self.remote['pay_1']['status'] = 'REFUNDED'
        self.hook(event='PAYMENT_REFUNDED')
        self.assertEqual(self.client.get(self.path()).data['status'], 'refunded')
        self.assertEqual(self.account().credits, 10)

    def test_partial_and_cancelled_refunds_are_reconciled_from_api(self):
        self.create()
        payment = self.remote['pay_1']
        payment['status'] = 'RECEIVED'
        payment['refunds'] = [{'status': 'CANCELLED', 'value': '19.99'}]
        self.hook(event='PAYMENT_REFUND_DENIED')
        self.assertEqual(self.client.get(self.path()).data['status'], 'approved')
        payment['refunds'].append({'status': 'DONE', 'value': '9.99'})
        self.hook(event='PAYMENT_PARTIALLY_REFUNDED')
        self.assertEqual(self.client.get(self.path()).data['status'], 'refund_review')
        self.assertEqual(self.account().credits, 210)
        payment['refunds'].append({'status': 'DONE', 'value': '10.00'})
        self.hook(event='PAYMENT_REFUNDED')
        self.assertEqual(self.client.get(self.path()).data['status'], 'refunded')
        self.assertEqual(self.account().credits, 10)

    def test_early_renewal_switch_and_expiration(self):
        today = timezone.localdate()
        self.create()
        self.remote['pay_1']['status'] = 'RECEIVED'
        self.hook()
        self.create(key=uuid4())
        self.remote['pay_2']['status'] = 'RECEIVED'
        self.hook(payment_id='pay_2')
        self.assertEqual(self.account().paid_until, today + timedelta(days=60))
        self.assertEqual(self.account().credits, 410)
        self.create('business', key=uuid4())
        self.remote['pay_3']['status'] = 'RECEIVED'
        self.hook(payment_id='pay_3')
        self.assertEqual(self.account().paid_until, today + timedelta(days=30))
        self.assertEqual(self.account().plan_id, 'business')
        self.assertEqual(self.account().credits, 1410)
        future = today + timedelta(days=31)
        with patch('promoforge.billing.timezone.localdate', return_value=future), patch(
            'promoforge.billing.current_period', return_value=future.replace(day=1),
        ):
            self.assertEqual(self.client.get('/api/billing/').data['plan']['code'], 'free')
        self.assertEqual(self.account().credits, 10)
        self.assertEqual(CreditMovement.objects.filter(key__startswith='pix:').count(), 3)

    def test_refunding_switch_restores_prior_access_and_unspent_balances(self):
        self.create()
        self.remote['pay_1']['status'] = 'RECEIVED'
        self.hook()
        self.create('business', key=uuid4())
        self.remote['pay_2']['status'] = 'RECEIVED'
        self.hook(payment_id='pay_2')
        account = self.account()
        account.credits -= 5
        account.save(update_fields=['credits'])
        CreditMovement.objects.create(subscription=account, key='spent', kind='generation', amount=-5, balance=account.credits)
        self.remote['pay_2']['status'] = 'REFUNDED'
        self.hook(event='PAYMENT_REFUNDED', payment_id='pay_2')
        self.assertEqual(self.account().plan_id, 'pro')
        self.assertEqual(self.account().credits, 210)
        self.remote['pay_1']['status'] = 'REFUNDED'
        self.hook(event='PAYMENT_REFUNDED')
        self.assertEqual(self.account().credits, 10)

    def test_timeout_recovered_by_reference_and_webhook_can_retry(self):
        self.simulate_timeout = True
        self.assertEqual(self.create().data['status'], 'processing')
        self.assertEqual(self.create(key=uuid4()).data['id'], self.order_id)
        self.assertEqual(len(self.remote), 1)
        self.assertIsNone(PixOrder.objects.get(pk=self.order_id).payment_id)
        self.assertEqual(self.client.post(self.path('refresh/')).data['status'], 'waiting')
        self.remote['pay_1']['status'] = 'RECEIVED'
        self.error = asaas.AsaasError()
        self.assertEqual(self.hook(event_id='evt_retry').status_code, 502)
        self.assertEqual(self.account().credits, 10)
        self.error = None
        self.assertEqual(self.hook(event_id='evt_retry').status_code, 200)
        self.assertEqual(self.account().credits, 210)

    def test_pix_only_disables_new_mercado_pago_checkout(self):
        billing = self.client.get('/api/billing/').data
        self.assertTrue(billing['pix_available'])
        self.assertFalse(billing['checkout_available'])
        self.assertEqual(self.client.post('/api/billing/change/', {'plan': 'pro'}).status_code, 409)
        change = PlanChange.objects.create(subscription=self.account(), plan_id='pro', status='authorized', expected_amount='19.99')
        self.assertEqual(self.create().status_code, 409)
        change.refresh_from_db()
        self.assertEqual(change.status, 'authorized')

    @override_settings(ASAAS_API_KEY='$aact_prod_fake')
    def test_unavailable_sandbox_does_not_offer_mercado_pago(self):
        billing = self.client.get('/api/billing/').data
        self.assertTrue(billing['pix_selected'])
        self.assertFalse(billing['pix_available'])
        self.assertFalse(billing['checkout_available'])
        self.assertEqual(self.client.post('/api/billing/change/', {'plan': 'pro'}).status_code, 409)
        self.assertEqual(self.create().status_code, 503)
        self.remote_calls.assert_not_called()

    @patch('promoforge.pix_views.take_or_throttle')
    def test_provider_http_errors_keep_customer_and_payment_failures_distinct(self, _throttle):
        self.assertEqual(self.client.get('/api/billing/').data['credits'], 10)
        for operation in (('/customers', 'GET'), ('/customers', 'POST'), ('/payments', 'POST')):
            for status in (400, 401, 403, 422, 500):
                with self.subTest(operation=operation, status=status):
                    def failing_provider(path, method='GET', data=None, *, query=None):
                        if (path, method) == operation:
                            raise asaas.AsaasError(status)
                        return self.provider(path, method, data, query=query)

                    key = uuid4()
                    with patch('promoforge.asaas.request', side_effect=failing_provider):
                        response = self.create(key=key)
                    order = PixOrder.objects.filter(pk=order_id_for(self.user, key)).first()
                    if operation[0] == '/customers':
                        expected = 400 if operation[1] == 'POST' and status in {400, 422} else 502
                        self.assertEqual(response.status_code, expected)
                        self.assertIsNone(order)
                    else:
                        self.assertEqual(response.status_code, 202)
                        self.assertEqual(order.status, 'processing' if status == 500 else 'rejected')
                        self.assertEqual(order.open, status == 500)
                    self.assertEqual(self.account().plan_id, 'free')
                    self.assertEqual(self.account().credits, 10)
                    self.assertFalse(CreditMovement.objects.filter(key__startswith='pix:').exists())


@override_settings(ASAAS_API_KEY='test-key', ASAAS_WEBHOOK_TOKEN=TOKEN)
class AsaasTransportTests(TestCase):
    @override_settings(ASAAS_ENVIRONMENT='production')
    def test_production_is_blocked_without_opening_a_connection(self):
        with patch('promoforge.asaas.build_opener') as opener:
            with self.assertRaises(asaas.AsaasUnavailable):
                asaas.request('/payments')
            opener.assert_not_called()

    @override_settings(ASAAS_ENVIRONMENT='sandbox')
    def test_sandbox_only_transport_timeout_with_safe_message(self):
        with patch('promoforge.asaas.build_opener') as opener:
            opener.return_value.open.side_effect = URLError('private-provider-details')
            with self.assertRaises(asaas.AsaasError) as error:
                asaas.request('/payments')
            self.assertNotIn('private-provider-details', str(error.exception))
            args, kwargs = opener.return_value.open.call_args
            self.assertEqual(args[0].full_url, 'https://api-sandbox.asaas.com/v3/payments')
            self.assertEqual(kwargs['timeout'], 5)

    @override_settings(ASAAS_ENVIRONMENT='sandbox', ASAAS_API_KEY='$aact_prod_fake')
    def test_production_key_is_blocked_in_sandbox(self):
        with patch('promoforge.asaas.build_opener') as opener:
            with self.assertRaises(asaas.AsaasUnavailable):
                asaas.request('/customers')
            opener.assert_not_called()

    @override_settings(ASAAS_ENVIRONMENT='sandbox', ASAAS_API_KEY='$aact_hmlg_fake')
    def test_http_error_logs_only_allowlisted_codes_and_static_operation(self):
        codes = {400: 'invalid_value', 401: 'invalid_environment', 403: 'forbidden',
                 422: 'invalid_object', 500: 'internal_error'}
        for path, payload in (
            ('/customers', {'name': 'Buyer Private', 'cpfCnpj': '24971563792'}),
            ('/payments', {'customer': 'cus_secret', 'billingType': 'PIX', 'value': 19.99, 'dueDate': '2026-11-28'}),
        ):
            for status, code in codes.items():
                with self.subTest(path=path, status=status), patch('promoforge.asaas.build_opener') as opener:
                    body = json.dumps({'errors': [
                        {'code': code, 'description': 'Buyer Private private@example.test'},
                        {'code': '24971563792'},
                        {'code': '$aact_hmlg_fake'},
                    ]}).encode()
                    opener.return_value.open.side_effect = HTTPError(path, status, 'private', {}, BytesIO(body))
                    with self.assertLogs('promoforge.asaas', 'WARNING') as logs, self.assertRaises(asaas.AsaasError) as error:
                        asaas.request(path, 'POST', payload)
                    self.assertEqual(error.exception.remote_status, status)
                    request = opener.return_value.open.call_args.args[0]
                    self.assertEqual(request.full_url, 'https://api-sandbox.asaas.com/v3' + path)
                    self.assertEqual(request.get_header('Access_token'), '$aact_hmlg_fake')
                    self.assertEqual(request.get_header('User-agent'), 'Ofertech/1.0')
                    self.assertEqual(request.get_header('Content-type'), 'application/json')
                    self.assertEqual(json.loads(request.data), payload)
                    log = logs.output[0]
                    self.assertIn(f'operation=POST {path} failure=http_error upstream_status={status}', log)
                    self.assertIn(f'codes={code},unrecognized_code', log)
                    for private in ('Buyer Private', 'private@example.test', '24971563792', '$aact_hmlg_fake', 'cus_secret', '19.99'):
                        self.assertNotIn(private, log)
