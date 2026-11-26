import csv
from datetime import datetime, time, timedelta
from decimal import Decimal
from uuid import uuid4

from django.contrib.auth import get_user_model
from django.utils import timezone
from rest_framework.test import APITestCase

from .billing_models import CreditMovement, PlanChange, RecurringInvoice, Subscription, SubscriptionPayment
from .models import CreditAdjustment, FlyerProject, UserActiveDay, VideoExport


class CommercialDashboardTests(APITestCase):
    base = '/api/admin-dashboard/'

    def setUp(self):
        users = get_user_model()
        self.admin = users.objects.create_superuser('owner')
        self.user = users.objects.create_user('customer', email='customer@example.test')
        self.other = users.objects.create_user('someone-else', email='other@example.test')

    def test_private_routes_reject_anonymous_customers_and_unprivileged_staff(self):
        self.assertEqual(self.client.get(self.base + 'overview/').status_code, 401)
        for staff in (False, True):
            self.user.is_staff = staff
            self.user.save(update_fields=['is_staff'])
            self.client.force_authenticate(self.user)
            for endpoint in ('overview/', 'users/', f'users/{self.other.pk}/history/', 'subscriptions/', 'payments/', 'reports.csv'):
                self.assertEqual(self.client.get(self.base + endpoint).status_code, 403)
            self.assertEqual(self.client.post(self.base + f'users/{self.other.pk}/adjust/', {}, format='json').status_code, 403)
            self.assertEqual(self.client.post(self.base + 'users/', {'search': 'someone'}, format='json').status_code, 403)

    def test_commercial_permissions_with_real_jwt_authentication(self):
        password = 'fixture-password-123'
        for account, expected in ((self.admin, 200), (self.user, 403)):
            self.client.credentials()
            account.set_password(password)
            account.save(update_fields=['password'])
            login = self.client.post('/api/auth/login/', {
                'username': account.username, 'password': password,
            }, format='json')
            self.assertEqual(login.status_code, 200)
            self.client.credentials(HTTP_AUTHORIZATION=f"Bearer {login.data['access']}")
            self.assertEqual(self.client.get(self.base + 'overview/').status_code, expected)

    def test_reports_use_distinct_daily_activity_confirmed_generation_and_confirmed_payments(self):
        today = timezone.localdate()
        yesterday = today - timedelta(days=1)
        self.client.force_authenticate(self.user)
        for _ in range(2):
            self.assertEqual(self.client.get('/api/auth/me/').status_code, 200)
        self.assertEqual(UserActiveDay.objects.filter(user=self.user, day=today).count(), 1)
        UserActiveDay.objects.create(user=self.user, day=yesterday)
        operation = {'operation': str(uuid4())}
        for _ in range(2):
            self.assertEqual(self.client.post('/api/usage/video-exports/', operation, format='json').status_code, 204)
        self.assertEqual(VideoExport.objects.count(), 1)
        for _ in range(2):
            self.assertEqual(self.client.post('/api/usage/print-exports/', {**operation, 'kind': 'labels', 'quantity': 18}, format='json').status_code, 204)
        account = Subscription.objects.get(user=self.user)
        CreditMovement.objects.create(subscription=account, key='art:test', kind='generation', amount=-3, balance=7)
        older = timezone.make_aware(datetime.combine(yesterday, time(12)))
        for name, design in [('flyer', {}), ('poster', {'print': {'kind': 'poster'}}), ('labels', {'print': {'kind': 'labels'}}), ('video', {'video': {}})]:
            project = FlyerProject.objects.create(owner=self.user, name=name, design=design)
            if name == 'flyer':
                FlyerProject.objects.filter(pk=project.pk).update(created_at=older)
        change = PlanChange.objects.create(subscription=account, plan_id='pro', expected_amount=Decimal('19.99'), status='cancelled')
        RecurringInvoice.objects.create(provider_id='older', change=change, due_on=yesterday, status='approved', applied=True)
        invoice = RecurringInvoice.objects.create(provider_id='current', change=change, due_on=today, status='approved', applied=True)
        for key, status in [('approved-id', 'approved'), ('pending-id', 'pending'), ('refund-id', 'refunded'), ('unverified-id', 'unconfirmed')]:
            SubscriptionPayment.objects.create(provider_id=key, invoice=invoice, status=status)

        self.client.force_authenticate(self.admin)
        exact = f'?start={today}&end={today}'
        response = self.client.get(self.base + 'overview/' + exact)
        self.assertEqual(response.status_code, 200, response.data)
        self.assertEqual(response['Cache-Control'], 'private, no-store')
        self.assertEqual(response.data['total_users'], 3)
        self.assertEqual(response.data['active_users'], 1)
        self.assertEqual(response.data['totals'], {
            'registrations': 3, 'banners': 3, 'flyers': 0, 'posters': 1,
            'labels': 1, 'video_projects': 1, 'video_exports': 1,
            'poster_exports': 0, 'label_exports': 18,
        })
        self.assertEqual(response.data['credits_consumed'], 3)
        self.assertEqual(response.data['billing']['confirmed_payments'], 1)
        self.assertEqual(Decimal(response.data['billing']['confirmed_test_volume']), Decimal('19.99'))
        self.assertIsNone(response.data['billing']['commercial_revenue'])
        self.assertEqual(response.data['billing']['applied_renewals'], 1)
        self.assertEqual(response.data['billing']['cancelled_subscriptions'], 1)
        self.assertEqual(self.client.get(self.base + 'subscriptions/?state=cancelled').data['count'], 1)
        self.assertEqual(self.client.get(self.base + 'subscriptions/?state=authorized').data['count'], 0)
        self.assertEqual(self.client.get(self.base + 'payments/' + exact).data['count'], 1)
        self.assertEqual(self.client.post(self.base + 'payments/', {}, format='json').status_code, 405)
        wider = self.client.get(self.base + f'overview/?start={yesterday}&end={today}').data
        self.assertEqual(wider['active_users'], 1)
        self.assertEqual(wider['totals']['flyers'], 1)
        self.assertEqual(self.client.get(self.base + f'overview/?start={today}&end={yesterday}').status_code, 400)

        csv_response = self.client.get(self.base + 'reports.csv' + exact)
        rows = list(csv.DictReader(csv_response.content.decode('utf-8-sig').splitlines()))
        self.assertEqual(rows[0]['data'], str(today))
        self.assertEqual(rows[0]['usuarios_ativos'], '1')
        self.assertEqual(rows[0]['banners'], '3')
        self.assertEqual(rows[0]['encartes'], '0')
        self.assertEqual(rows[0]['videos_exportados'], '1')
        self.assertEqual(rows[0]['etiquetas_exportadas'], '18')
        self.assertNotIn(self.user.email, csv_response.content.decode())

    def test_credit_adjustments_are_atomic_idempotent_and_audited_per_customer(self):
        self.client.force_authenticate(self.admin)
        searched = self.client.post(self.base + 'users/?page=1', {'search': self.user.email}, format='json')
        self.assertEqual(searched.status_code, 200)
        self.assertEqual(searched.data['count'], 1)
        self.assertEqual(set(searched.data['results'][0]), {'id', 'name', 'email', 'registered_at', 'enabled', 'plan', 'credits'})
        url = self.base + f'users/{self.user.pk}/adjust/'
        payload = {'amount': 5, 'reason': 'Correção verificada', 'operation': str(uuid4())}
        self.assertEqual(self.client.post(url, payload, format='json').status_code, 201)
        self.assertEqual(self.client.post(url, payload, format='json').status_code, 200)
        self.assertEqual(self.client.post(url, {**payload, 'amount': 3}, format='json').status_code, 400)
        self.assertEqual(self.client.post(url, {**payload, 'amount': -999, 'operation': str(uuid4())}, format='json').status_code, 400)
        self.assertEqual(Subscription.objects.get(user=self.user).credits, 15)
        audit = CreditAdjustment.objects.get()
        self.assertEqual((audit.actor_identifier, audit.target_identifier, audit.balance_before, audit.balance_after), (self.admin.pk, self.user.pk, 10, 15))
        history = self.client.get(self.base + f'users/{self.user.pk}/history/').data['results']
        self.assertEqual(history[0]['adjustment']['reason'], payload['reason'])
        self.assertEqual(self.client.get(self.base + f'users/{self.other.pk}/history/').data['count'], 0)
        self.client.force_authenticate(self.user)
        billing = self.client.get('/api/billing/').data
        self.assertEqual(billing['used'], 0)
        self.assertEqual(billing['credits'], 15)
        self.assertNotIn('adjustment', billing['history'][0])
