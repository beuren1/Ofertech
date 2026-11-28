import json
from datetime import timedelta
from unittest.mock import patch
from uuid import uuid4

from django.contrib.auth import get_user_model
from django.test import TestCase, override_settings
from django.utils import timezone
from rest_framework.test import APIClient

from . import asaas
from .billing_models import CreditMovement, PixOrder, PixWebhookEvent, Subscription
from .pix_billing import order_id_for


SANDBOX_KEY = '$aact_hmlg_fixture'
PRODUCTION_KEY = '$aact_prod_fixture'
SANDBOX_TOKEN = 'sandbox-webhook-fixture-only-12345678'
PRODUCTION_TOKEN = 'production-webhook-fixture-only-12345678'
WEBHOOK = '/api/billing/webhooks/asaas/production/'


@override_settings(
    ASAAS_ENVIRONMENT='production',
    ASAAS_API_KEY='',
    ASAAS_WEBHOOK_TOKEN='',
    ASAAS_PRODUCTION_ENABLED=True,
    ASAAS_PRODUCTION_API_KEY=PRODUCTION_KEY,
    ASAAS_PRODUCTION_WEBHOOK_TOKEN=PRODUCTION_TOKEN,
)
class ProductionPixTests(TestCase):
    def setUp(self):
        self.user = get_user_model().objects.create_user(username='pix-production-fixture')
        self.client = APIClient()
        self.client.force_authenticate(user=self.user)
        self.key = uuid4()
        self.payment = {}
        self.qr_error = False

    def create(self, plan='pro'):
        return self.client.post('/api/billing/pix/', {
            'key': str(self.key), 'plan': plan, 'name': 'Fixture', 'document': '24971563792', 'amount': '0.01',
        }, format='json')

    def provider(self, path, method='GET', data=None, *, query=None):
        if path == '/customers' and method == 'GET':
            return {'data': []}
        if path == '/customers' and method == 'POST':
            return {'id': 'cus_production', 'externalReference': data['externalReference']}
        if path == '/payments' and method == 'POST':
            self.payment = {
                **data, 'id': 'pay_overlap', 'status': 'PENDING', 'currency': 'BRL',
                'invoiceUrl': 'https://www.asaas.com/i/production-fixture',
            }
            return self.payment.copy()
        if path == '/payments/pay_overlap/pixQrCode' and self.qr_error:
            raise asaas.AsaasError(400)
        if path == '/payments/pay_overlap':
            return self.payment.copy()
        self.fail(f'Unexpected provider operation {method} {path}')

    def hook(self, *, token=PRODUCTION_TOKEN, url=WEBHOOK, event_id='evt_shared'):
        return self.client.post(url, {
            'id': event_id, 'event': 'PAYMENT_RECEIVED',
            'payment': {'id': 'pay_overlap', 'status': 'RECEIVED'},
        }, format='json', HTTP_ASAAS_ACCESS_TOKEN=token)

    def test_opt_in_and_separate_credentials_required(self):
        for configuration in (
            {'ASAAS_PRODUCTION_ENABLED': False},
            {'ASAAS_PRODUCTION_API_KEY': SANDBOX_KEY},
            {'ASAAS_PRODUCTION_WEBHOOK_TOKEN': SANDBOX_TOKEN, 'ASAAS_WEBHOOK_TOKEN': SANDBOX_TOKEN},
            {'ASAAS_PRODUCTION_WEBHOOK_TOKEN': PRODUCTION_KEY},
            {'ASAAS_PRODUCTION_API_KEY': ''},
            {'ASAAS_PRODUCTION_WEBHOOK_TOKEN': ''},
        ):
            with self.subTest(configuration=configuration), override_settings(**configuration):
                with patch('promoforge.asaas.build_opener') as opener:
                    self.assertEqual(self.create().status_code, 503)
                    opener.assert_not_called()

    def test_outbound_host_headers_and_pause_guard(self):
        with patch('promoforge.asaas.build_opener') as opener:
            response = opener.return_value.open.return_value.__enter__.return_value
            response.status = 200
            response.read.return_value = b'{}'
            asaas.request('/payments', 'POST', {'billingType': 'PIX'})
            outbound = opener.return_value.open.call_args.args[0]
            self.assertEqual(outbound.full_url, 'https://api.asaas.com/v3/payments')
            self.assertEqual(outbound.get_header('Access_token'), PRODUCTION_KEY)
            self.assertEqual(json.loads(outbound.data), {'billingType': 'PIX'})
            opener.reset_mock()
            with override_settings(ASAAS_PRODUCTION_ENABLED=False):
                with self.assertRaises(asaas.AsaasUnavailable):
                    asaas.request('/payments', 'POST', {})
                opener.assert_not_called()
                asaas.request('/payments/pay_overlap')
                opener.assert_called_once()

    def test_orders_customers_and_events_are_isolated_and_credits_are_idempotent(self):
        self.client.get('/api/billing/')
        account = Subscription.objects.get(user=self.user)
        with override_settings(ASAAS_ENVIRONMENT='sandbox'):
            sandbox_id = order_id_for(self.user, self.key)
        sandbox_order = PixOrder.objects.create(
            id=sandbox_id, subscription=account, plan_id='pro', amount='19.99', credits=200,
            customer_id='cus_sandbox', payment_id='pay_overlap', due_on=timezone.localdate(),
        )
        PixWebhookEvent.objects.create(pk='sandbox:evt_shared', order=sandbox_order)
        with patch('promoforge.asaas.request', side_effect=self.provider) as api:
            billing = self.client.get('/api/billing/').data
            self.assertFalse(billing['pix_customer_registered'])
            self.assertIsNone(billing['pix_order'])
            self.assertEqual(self.client.get(f'/api/billing/pix/{sandbox_id}/').status_code, 404)
            self.assertEqual(self.client.post(f'/api/billing/pix/{sandbox_id}/qr/').status_code, 404)
            result = self.create()
            self.assertEqual(result.status_code, 202)
            self.assertEqual(result.data['environment'], 'production')
            self.assertNotEqual(result.data['id'], sandbox_id)
            self.assertEqual(result.data['amount'], '19.99')
            self.assertEqual(self.payment['customer'], 'cus_production')
            self.assertEqual(self.payment['dueDate'], (timezone.localdate() + timedelta(days=1)).isoformat())
            self.assertEqual(self.create().data['id'], result.data['id'])
            self.qr_error = True
            qr_endpoint = f'/api/billing/pix/{result.data["id"]}/qr/'
            self.assertEqual(self.client.post(qr_endpoint).data['invoice_url'], self.payment['invoiceUrl'])
            self.payment['invoiceUrl'] = 'https://sandbox.asaas.com/i/other-environment'
            self.assertEqual(self.client.post(qr_endpoint).status_code, 502)
            self.assertEqual(self.hook(token='').status_code, 401)
            self.assertEqual(self.hook(token=SANDBOX_TOKEN).status_code, 401)
            self.assertEqual(self.hook(url='/api/billing/webhooks/asaas/').status_code, 401)
            self.assertEqual(self.hook(event_id='evt_pending').status_code, 200)
            account.refresh_from_db()
            self.assertEqual(account.credits, 10)
            self.payment['status'] = 'CONFIRMED'
            self.assertEqual(self.hook(event_id='evt_confirmed').status_code, 200)
            self.payment['status'] = 'RECEIVED'
            self.payment['value'] = '0.01'
            self.assertEqual(self.hook().status_code, 502)
            self.payment['value'] = '19.99'
            with override_settings(ASAAS_PRODUCTION_ENABLED=False):
                self.assertEqual(self.hook().status_code, 200)
            before_replay = api.call_count
            self.assertEqual(self.hook().status_code, 200)
            self.assertEqual(api.call_count, before_replay)
            account.refresh_from_db()
            self.assertEqual(account.credits, 210)
            self.assertEqual(account.paid_until, timezone.localdate() + timedelta(days=30))
            self.assertEqual(account.paid_pix_order_id, result.data['id'])
            self.assertTrue(PixWebhookEvent.objects.filter(pk='production:evt_shared').exists())
            self.payment['status'] = 'REFUNDED'
            self.assertEqual(self.hook(event_id='evt_refund').status_code, 200)
            self.assertEqual(self.hook(event_id='evt_refund').status_code, 200)
            account.refresh_from_db()
            self.assertEqual(account.credits, 10)
            self.assertEqual(account.plan_id, 'free')
            self.assertEqual(CreditMovement.objects.filter(kind='pix_refund').count(), 1)

    def test_business_price_and_ambiguous_failure(self):
        with patch('promoforge.asaas.request', side_effect=self.provider) as api:
            def timeout_after_post(path, method='GET', data=None, *, query=None):
                result = self.provider(path, method, data, query=query)
                if path == '/payments' and method == 'POST':
                    raise asaas.AsaasError(500)
                return result

            api.side_effect = timeout_after_post
            result = self.create('business')
            self.assertEqual(result.data['amount'], '39.99')
            self.assertEqual(result.data['status'], 'processing')
            self.assertEqual(PixOrder.objects.get(pk=result.data['id']).credits, 1000)
            attempts = api.call_count
            self.assertEqual(self.create('business').data['id'], result.data['id'])
            self.assertEqual(api.call_count, attempts)
