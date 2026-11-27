from datetime import date, timedelta
from unittest.mock import patch
from uuid import uuid4
import base64

from django.contrib.auth import get_user_model
from django.core.files.uploadedfile import SimpleUploadedFile
from django.test import TestCase
from django.utils import timezone
from rest_framework.test import APIClient

from .billing_models import CreditMovement, Subscription


PNG = base64.b64decode(
    'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+j5uoAAAAASUVORK5CYII='
)


def paid_fixture(user, plan='pro', credits=200):
    return Subscription.objects.update_or_create(user=user, defaults={
        'plan_id': plan, 'credits': credits, 'monthly_limit': credits,
        'period': timezone.localdate().replace(day=1), 'paid_until': timezone.localdate() + timedelta(days=31),
    })[0]


class BillingTests(TestCase):
    def setUp(self):
        self.user = get_user_model().objects.create_user(username='customer')
        self.client = APIClient()
        self.client.force_authenticate(self.user)
        self.period = patch('promoforge.billing.current_period', return_value=date(2026, 11, 1))
        self.clock = self.period.start()
        self.addCleanup(self.period.stop)

    def account(self):
        response = self.client.get('/api/billing/')
        self.assertEqual(response.status_code, 200, response.data)
        return response.data

    def generate(self, key=None, images=None, count=1):
        data = {'key': str(key or uuid4()), 'count': count}
        if images is None:
            return self.client.post('/api/billing/artworks/', data, format='json')
        data['file'] = [SimpleUploadedFile('art.png', contents, 'image/png') for contents in images]
        return self.client.post('/api/billing/artworks/', data, format='multipart')

    def test_free_plan_and_authenticated_account(self):
        self.assertEqual(self.account()['plan']['code'], 'free')
        self.assertEqual(self.account()['plan']['name'], 'Grátis')
        self.assertEqual(self.account()['credits'], 10)
        self.assertEqual(Subscription.objects.get(user=self.user).credits, 10)
        self.client.force_authenticate(None)
        self.assertEqual(self.client.get('/api/billing/').status_code, 401)
        catalog = self.client.get('/api/plans/')
        self.assertEqual([p['monthly_price'] for p in catalog.data], ['0.00', '19.99', '39.99'])

    def test_success_and_retry_with_same_key(self):
        paid_fixture(self.user, credits=10)
        key = uuid4()
        self.assertEqual(self.generate(key, count=3).status_code, 200)
        self.assertEqual(self.account()['credits'], 10)
        for _ in range(2):
            self.assertEqual(self.generate(key, images=[PNG, PNG], count=2).status_code, 200)
        account = self.account()
        self.assertEqual(account['credits'], 8)
        self.assertEqual(account['used'], 2)
        self.assertEqual(CreditMovement.objects.filter(kind='generation').count(), 1)
        self.assertEqual(self.generate(key, images=[PNG]).status_code, 400)

    def test_invalid_and_incomplete_artworks_do_not_consume_credits(self):
        self.assertEqual(self.generate(images=[b'invalid']).status_code, 400)
        self.assertEqual(self.generate(images=[PNG[:12]]).status_code, 400)
        self.assertEqual(self.generate(images=[PNG], count=2).status_code, 400)
        self.assertEqual(self.account()['credits'], 10)
        self.assertFalse(CreditMovement.objects.filter(kind='generation').exists())

    def test_limit_and_user_isolation(self):
        key = uuid4()
        for attempt in range(10):
            self.assertEqual(self.generate(key if attempt == 0 else None, images=[PNG]).status_code, 200)
        self.assertEqual(self.generate().status_code, 409)
        self.assertEqual(self.generate(images=[PNG]).status_code, 409)
        self.assertEqual(self.client.patch('/api/billing/', {'credits': 500}).status_code, 405)
        other = get_user_model().objects.create_user(username='other')
        self.client.force_authenticate(other)
        self.assertEqual(self.account()['credits'], 10)
        self.assertEqual(self.generate(key, images=[PNG]).status_code, 200)
        self.assertEqual(Subscription.objects.get(user=self.user).credits, 0)
        self.assertEqual(self.account()['credits'], 9)

    def test_monthly_renewal_and_retry_across_months(self):
        key = uuid4()
        self.assertEqual(self.generate(key, images=[PNG]).status_code, 200)
        self.clock.return_value = date(2026, 12, 1)
        for _ in range(2):
            self.assertEqual(self.account()['credits'], 10)
        self.assertEqual(self.generate(key, images=[PNG]).status_code, 200)
        self.assertEqual(self.account()['credits'], 10)
        self.assertEqual(CreditMovement.objects.filter(kind='renewal').count(), 2)

    def test_paid_checkout_is_disabled_without_configuration(self):
        with self.settings(
            MP_MODE='test',
            MP_ACCESS_TOKEN='fixture-token', MP_TEST_SELLER_ID='123',
            MP_TEST_BUYER_EMAIL='buyer@testuser.com', MP_WEBHOOK_SECRET='fixture-secret',
            MP_BACK_URL='https://test.example.org/plans',
        ), patch('promoforge.mercado_pago.request_mp') as request_mp:
            self.assertFalse(self.account()['checkout_available'])
            self.assertEqual(self.client.post('/api/billing/change/', {'plan': 'pro'}, format='json').status_code, 403)
            self.user.email = 'buyer@testuser.com'
            self.user.save(update_fields=['email'])
            self.assertTrue(self.account()['checkout_available'])
            for setting in ('MP_ACCESS_TOKEN', 'MP_WEBHOOK_SECRET', 'MP_BACK_URL'):
                with self.subTest(setting=setting), self.settings(**{setting: ''}):
                    self.assertFalse(self.account()['checkout_available'])
                    response = self.client.post('/api/billing/change/', {'plan': 'pro'}, format='json')
                    self.assertEqual(response.status_code, 503)
            request_mp.assert_not_called()
        self.assertEqual(self.account()['plan']['code'], 'free')
        self.assertEqual(self.account()['credits'], 10)

