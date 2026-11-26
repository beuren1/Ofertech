from concurrent.futures import ThreadPoolExecutor
from io import BytesIO
from threading import Barrier
from uuid import uuid4
from zipfile import ZipFile

from django.contrib.auth import get_user_model
from django.core.files.uploadedfile import SimpleUploadedFile
from django.db import connections
from django.test import TestCase, TransactionTestCase
from rest_framework.test import APIClient

from .billing_models import CreditMovement, Plan
from .test_billing import PNG, paid_fixture


def operation(client, kind, *, key=None, count=1, format='png', evidence=None, premium=False):
    data = {'key': str(key or uuid4()), 'kind': kind, 'count': count, 'format': format, 'premium': str(premium).lower()}
    if evidence is None:
        return client.post('/api/billing/operations/', data, format='json')
    data['file'] = SimpleUploadedFile(f'arte.{format}', evidence)
    return client.post('/api/billing/operations/', data, format='multipart')


class EntitlementsTests(TestCase):
    def setUp(self):
        self.user = get_user_model().objects.create_user(username='plan-user')
        self.client = APIClient()
        self.client.force_authenticate(self.user)

    def test_free_projects_block_only_premium_features_and_formats(self):
        for kind, format, count, premium in (
            ('poster', 'pdf', 1, False), ('poster', 'png', 1, True),
        ):
            with self.subTest(kind=kind, format=format, premium=premium):
                self.assertEqual(operation(self.client, kind, format=format, count=count, premium=premium).status_code, 403)
        self.assertEqual(operation(self.client, 'poster', count=6, format='zip').status_code, 400)
        self.assertEqual(operation(self.client, 'poster', count=5, format='zip').data['cost'], 10)

    def test_free_cutout_costs_one_credit_after_confirmation(self):
        key = uuid4()
        self.assertEqual(operation(self.client, 'cutout', key=key).data['credits'], 10)
        for _ in range(2):
            result = operation(self.client, 'cutout', key=key, evidence=PNG)
            self.assertEqual(result.status_code, 200, result.data)
            self.assertEqual(result.data, {'credits': 9, 'cost': 1})

    def test_free_can_export_five_at_two_credits_using_shared_balance(self):
        for kind, format, evidence in (
            ('poster', 'png', PNG), ('flyer', 'png', PNG), ('labels', 'png', PNG),
            ('video', 'mp4', b'\x00\x00\x00\x14ftypisom\x00\x00\x00\x00'),
        ):
            with self.subTest(kind=kind):
                user = get_user_model().objects.create_user(username=f'free-{kind}')
                self.client.force_authenticate(user)
                for remaining in (8, 6, 4, 2, 0):
                    key = uuid4()
                    response = operation(self.client, kind, key=key, format=format, evidence=evidence)
                    self.assertEqual(response.status_code, 200, response.data)
                    self.assertEqual(response.data, {'credits': remaining, 'cost': 2})
                    self.assertEqual(operation(self.client, kind, key=key, format=format, evidence=evidence).data, response.data)
                self.assertEqual(operation(self.client, 'poster', evidence=PNG).status_code, 409)

    def test_free_banners_in_bulk_cost_one_each(self):
        endpoint = '/api/billing/artworks/'
        self.assertEqual(self.client.post(endpoint, {'key': str(uuid4()), 'count': 6, 'bulk': True}, format='json').status_code, 400)
        fields = {'key': str(uuid4()), 'count': 5, 'bulk': 'true'}
        for _ in range(2):
            files = [SimpleUploadedFile('art.png', PNG, 'image/png') for _ in range(5)]
            response = self.client.post(endpoint, {**fields, 'file': files}, format='multipart')
            self.assertEqual(response.status_code, 200, response.data)
            self.assertEqual(response.data['credits'], 5)
        self.assertEqual(CreditMovement.objects.filter(kind='generation').count(), 1)

    def test_paid_operation_costs_preflight_and_retries(self):
        account = paid_fixture(self.user, credits=20)
        for kind, cost, format, evidence in (
            ('flyer', 2, 'png', PNG), ('poster', 1, 'png', PNG), ('labels', 1, 'png', PNG),
            ('video', 5, 'mp4', b'\x00\x00\x00\x14ftypisom\x00\x00\x00\x00'), ('cutout', 1, 'png', PNG),
        ):
            key = uuid4()
            expected = account.credits - cost
            self.assertEqual(operation(self.client, kind, key=key, format=format).data['credits'], account.credits)
            self.assertEqual(operation(self.client, kind, key=key, format=format, evidence=b'incomplete').status_code, 400)
            for _ in range(2):
                result = operation(self.client, kind, key=key, format=format, evidence=evidence)
                self.assertEqual(result.status_code, 200, result.data)
                self.assertEqual(result.data['credits'], expected)
            account.refresh_from_db()
        self.assertEqual(self.client.get('/api/billing/').data['used'], 10)

    def test_plan_store_and_batch_limits_preserve_existing_stores(self):
        endpoint = '/api/stores/'
        self.assertEqual(self.client.post(endpoint, {'name': 'Primeira'}, format='json').status_code, 201)
        self.assertEqual(self.client.post(endpoint, {'name': 'Segunda'}, format='json').status_code, 400)
        paid_fixture(self.user)
        for number in range(2):
            self.assertEqual(self.client.post(endpoint, {'name': f'Loja {number}'}, format='json').status_code, 201)
        self.assertEqual(self.client.post(endpoint, {'name': 'Quarta'}, format='json').status_code, 400)
        self.assertEqual(operation(self.client, 'poster', count=51, format='pdf').status_code, 400)
        paid_fixture(self.user, 'business', credits=1000)
        self.assertEqual(operation(self.client, 'poster', count=51, format='pdf').status_code, 200)
        for number in range(7):
            self.assertEqual(self.client.post(endpoint, {'name': f'Filial {number}'}, format='json').status_code, 201)
        self.assertEqual(self.client.post(endpoint, {'name': 'Décima primeira'}, format='json').status_code, 400)
        self.assertEqual(self.user.store_brands.count(), 10)

    def test_multipage_receipts_validate_quantity_and_charge_each_page(self):
        paid_fixture(self.user, credits=20)
        pdf = b'%PDF-1.6\n2 0 obj\n<< /Type /Pages /Count 2 /Kids [3 0 R 6 0 R] >>\nendobj\n%%EOF\n'
        self.assertEqual(operation(self.client, 'flyer', format='pdf', count=1, evidence=pdf).status_code, 400)
        self.assertEqual(operation(self.client, 'flyer', format='pdf', count=2, evidence=pdf).data['credits'], 16)
        stream = BytesIO()
        with ZipFile(stream, 'w') as archive:
            archive.writestr('pagina-01.png', PNG)
            archive.writestr('pagina-02.png', PNG)
        self.assertEqual(operation(self.client, 'labels', format='zip', count=2, evidence=stream.getvalue()).data['credits'], 14)

    def test_business_templates_and_store_filter_keep_owner_isolation(self):
        paid_fixture(self.user)
        body = {'name': 'Modelo reutilizável', 'category': 'banner', 'configuration': {'template': 'general'}}
        self.assertEqual(self.client.post('/api/templates/', body, format='json').status_code, 403)
        self.assertEqual(self.client.get('/api/campaigns/?store_brand=none').status_code, 403)
        paid_fixture(self.user, 'business', credits=1000)
        template = self.client.post('/api/templates/', body, format='json')
        self.assertEqual(template.status_code, 201)
        store = self.client.post('/api/stores/', {'name': 'Loja própria'}, format='json').data
        campaign = self.client.post('/api/campaigns/', {'name': 'Promoção própria', 'store_brand': store['id']}, format='json')
        self.assertEqual(campaign.status_code, 201, campaign.data)
        self.assertEqual(self.client.get(f'/api/campaigns/?store_brand={store["id"]}').data['count'], 1)
        other = get_user_model().objects.create_user(username='other-business')
        paid_fixture(other, 'business', credits=1000)
        self.client.force_authenticate(other)
        self.assertEqual(self.client.get(f'/api/campaigns/?store_brand={store["id"]}').data['count'], 0)
        self.assertEqual(self.client.get(f'/api/templates/{template.data["id"]}/').status_code, 404)
        self.assertEqual(self.client.post('/api/campaigns/', {'name': 'Outra loja', 'store_brand': store['id']}, format='json').status_code, 400)


class ConcurrentCreditTests(TransactionTestCase):
    def test_parallel_operations_can_only_spend_the_available_credit(self):
        Plan.objects.get_or_create(code='pro', defaults={'monthly_credits': 200, 'monthly_price': '19.99', 'name': 'Pro'})
        user = get_user_model().objects.create_user(username='parallel-credit')
        account = paid_fixture(user, credits=1)
        gate = Barrier(2)

        def confirm(_):
            client = APIClient()
            client.force_authenticate(user)
            try:
                gate.wait(timeout=5)
                return operation(client, 'poster', evidence=PNG).status_code
            finally:
                connections.close_all()

        with ThreadPoolExecutor(max_workers=2) as executor:
            self.assertEqual(sorted(executor.map(confirm, range(2))), [200, 409])
        account.refresh_from_db()
        self.assertEqual(account.credits, 0)
        self.assertEqual(CreditMovement.objects.filter(subscription=account, kind='poster').count(), 1)
