from datetime import datetime, timedelta
from unittest.mock import patch
from urllib.parse import parse_qs, urlsplit

from django.contrib.auth import get_user_model
from django.contrib.auth.tokens import default_token_generator
from django.core import mail
from django.core.management import call_command
from django.test import RequestFactory, override_settings
from django.utils import timezone
from django.utils.encoding import force_bytes
from django.utils.http import urlsafe_base64_encode
from rest_framework.test import APIClient, APITestCase

from .auth_security import client_ip, process_reset_deliveries
from .models import AuthRateWindow, PasswordResetDelivery


@override_settings(
    EMAIL_BACKEND='django.core.mail.backends.locmem.EmailBackend',
    PASSWORD_RESET_URL='https://app.ofertei.example/reset-password',
)
class PasswordSecurityTests(APITestCase):
    request_url = '/api/auth/password-reset/'
    confirm_url = '/api/auth/password-reset/confirm/'
    password = 'Senha-nova-livre-456!'

    def setUp(self):
        self.account = get_user_model().objects.create_user(
            username='cliente@example.test', email='cliente@example.test', password='Senha-antiga-livre-123!',
        )

    def reset_request(self, email, **extra):
        return self.client.post(self.request_url, {'email': email}, format='json', **extra)

    def confirm(self, token, *, uid=None, password=None, **extra):
        return self.client.post(self.confirm_url, {
            'uid': uid if uid is not None else urlsafe_base64_encode(force_bytes(self.account.pk)),
            'token': token, 'password': password or self.password,
        }, format='json', **extra)

    def login(self, username=None, password='Senha-antiga-livre-123!', **extra):
        return self.client.post('/api/auth/login/', {
            'username': username or self.account.username, 'password': password,
        }, format='json', **extra)

    def test_generic_request_and_async_single_delivery_with_password_reset(self):
        known = self.reset_request(self.account.email)
        unknown = self.reset_request('inexistente@example.test')
        self.assertEqual((known.status_code, unknown.status_code), (202, 202))
        self.assertEqual(known.data, unknown.data)
        self.assertIn('no-store', known['Cache-Control'])
        self.assertEqual(len(mail.outbox), 0)
        self.assertEqual(PasswordResetDelivery.objects.count(), 2)
        repeated = self.reset_request(self.account.email.upper(), REMOTE_ADDR='192.0.2.20')
        self.assertEqual(repeated.data, known.data)
        self.assertEqual(PasswordResetDelivery.objects.count(), 2)
        call_command('process_password_reset_emails')
        call_command('process_password_reset_emails')
        self.assertEqual(len(mail.outbox), 1)
        self.assertEqual(mail.outbox[0].to, [self.account.email])
        self.assertIn('30 minutos', mail.outbox[0].body)
        self.assertIn('Ofertech', mail.outbox[0].alternatives[0].content)
        link = next(line for line in mail.outbox[0].body.splitlines() if line.startswith('https://'))
        parsed = urlsplit(link)
        self.assertEqual(parsed.path, '/reset-password')
        self.assertFalse(parsed.query)
        fields = parse_qs(parsed.fragment)
        self.assertEqual(self.confirm(fields['token'][0], uid=fields['uid'][0]).status_code, 200)
        self.assertEqual(self.confirm(fields['token'][0], uid=fields['uid'][0]).status_code, 400)
        self.account.refresh_from_db()
        self.assertTrue(self.account.check_password(self.password))
        self.assertEqual(self.login().status_code, 401)
        self.assertEqual(self.login(password=self.password).status_code, 200)

    def test_expired_invalid_unknown_uid_and_password_validation(self):
        now = datetime(2026, 11, 26, 12)
        with patch.object(default_token_generator, '_now', return_value=now):
            token = default_token_generator.make_token(self.account)
        with patch.object(default_token_generator, '_now', return_value=now + timedelta(minutes=30, seconds=1)):
            expired = self.confirm(token)
        invalid = self.confirm('invalid-token')
        unknown = self.confirm('invalid-token', uid=urlsafe_base64_encode(b'999999'))
        malformed = self.confirm('invalid-token', uid='%%%')
        self.assertEqual(expired.status_code, 400)
        self.assertEqual(expired.data, invalid.data)
        self.assertEqual(unknown.data, invalid.data)
        self.assertEqual(malformed.data, invalid.data)
        with patch.object(default_token_generator, '_now', return_value=now + timedelta(minutes=29)):
            weak = self.confirm(token, password='12345678')
            self.assertEqual(weak.status_code, 400)
            self.assertIn('password', weak.data)
            self.assertEqual(self.confirm(token).status_code, 200)

    def test_reset_revokes_existing_access_and_refresh_tokens_in_multiple_sessions(self):
        first = self.login()
        second = self.login()
        self.assertEqual((first.status_code, second.status_code), (200, 200))
        self.assertEqual(self.confirm(default_token_generator.make_token(self.account)).status_code, 200)
        for session in (first, second):
            stale = APIClient()
            stale.credentials(HTTP_AUTHORIZATION=f"Bearer {session.data['access']}")
            self.assertEqual(stale.get('/api/auth/me/').status_code, 401)
            stale.credentials()
            stale.cookies['promoforge_refresh'] = session.cookies['promoforge_refresh'].value
            self.assertEqual(stale.post('/api/auth/refresh/', {}, format='json').status_code, 401)

    def test_login_limits_by_account_and_ip_without_persistent_lock(self):
        now = timezone.now()
        with patch('promoforge.views.LOGIN_ACCOUNT_LIMIT', (2, 900)), patch('promoforge.views.LOGIN_IP_LIMIT', (4, 900)):
            with patch('promoforge.auth_security.timezone.now', return_value=now):
                wrong = self.login(password='fixture-sensitive-value', REMOTE_ADDR='192.0.2.10')
                unknown = self.login(username='unknown@example.test', password='fixture-sensitive-value', REMOTE_ADDR='192.0.2.10')
                self.assertEqual(wrong.status_code, 401)
                self.assertEqual(unknown.data, wrong.data)
                self.assertEqual(self.login(password='invalid', REMOTE_ADDR='192.0.2.11').status_code, 401)
                with self.assertLogs('promoforge.auth_security', level='WARNING') as events:
                    locked = self.login(REMOTE_ADDR='192.0.2.12')
                self.assertEqual(locked.status_code, 429)
                self.assertIn('Retry-After', locked)
                self.assertEqual(events.records[0].getMessage(), 'auth.rate_limited scope=login-account')
                for index in range(2):
                    self.assertEqual(self.login(username=f'absent-{index}@example.test', password='bad', REMOTE_ADDR='192.0.2.10').status_code, 401)
                self.assertEqual(self.login(username='new@example.test', REMOTE_ADDR='192.0.2.10',
                                            HTTP_X_FORWARDED_FOR='192.0.2.99', HTTP_CF_CONNECTING_IP='192.0.2.99').status_code, 429)
            with patch('promoforge.auth_security.timezone.now', return_value=now + timedelta(minutes=16)):
                self.assertEqual(self.login(REMOTE_ADDR='192.0.2.12').status_code, 200)

    def test_reset_rate_limit_response_and_confirmation_limit(self):
        with patch('promoforge.auth_security.RESET_REQUEST_IP_LIMIT', (1, 900)):
            first = self.reset_request(self.account.email)
            limited = self.reset_request('another@example.test')
            self.assertEqual(first.data, limited.data)
            self.assertEqual(limited.status_code, 202)
            self.assertEqual(PasswordResetDelivery.objects.count(), 1)
        with patch('promoforge.views.RESET_CONFIRM_IP_LIMIT', (1, 900)):
            self.assertEqual(self.confirm('bad-token').status_code, 400)
            self.assertEqual(self.confirm('bad-token').status_code, 429)
            self.assertEqual(self.confirm(default_token_generator.make_token(self.account), REMOTE_ADDR='192.0.2.15').status_code, 200)

    def test_delivery_retries_are_bounded_and_do_not_log_the_email_or_exception(self):
        self.reset_request(self.account.email)
        now = timezone.now()
        with patch('promoforge.auth_security.send_reset_email', side_effect=RuntimeError('fixture-sensitive-value')) as delivery:
            with self.assertLogs('promoforge.auth_security', level='WARNING') as events:
                for minutes in (0, 3, 6):
                    with patch('promoforge.auth_security.timezone.now', return_value=now + timedelta(minutes=minutes)):
                        process_reset_deliveries()
            self.assertEqual(delivery.call_count, 3)
        self.assertEqual([message.getMessage() for message in events.records], ['auth.password_reset_delivery_failed'] * 3)
        self.assertFalse(PasswordResetDelivery.objects.exists())

    def test_untrusted_browser_origin_is_rejected_before_rate_limit(self):
        self.assertEqual(self.login(HTTP_ORIGIN='https://other.example.test').status_code, 403)
        self.assertEqual(self.reset_request(self.account.email, HTTP_ORIGIN='https://other.example.test').status_code, 403)
        self.assertFalse(AuthRateWindow.objects.exists())

    @override_settings(ON_RENDER=True, SESSION_COOKIE_SECURE=True, CORS_ALLOWED_ORIGINS=['https://ofertech.vercel.app'])
    def test_render_cookie_endpoints_require_trusted_origin(self):
        for endpoint in ('login', 'refresh', 'logout', 'register', 'password-reset', 'password-reset/confirm'):
            for origin in ({}, {'HTTP_ORIGIN': 'null'}, {'HTTP_ORIGIN': 'https://other.example.test'}):
                response = self.client.post(f'/api/auth/{endpoint}/', {}, **origin)
                self.assertEqual(response.status_code, 403)

        origin = {'HTTP_ORIGIN': 'https://ofertech.vercel.app'}
        response = self.login(**origin)
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response['Access-Control-Allow-Origin'], origin['HTTP_ORIGIN'])
        cookie = response.cookies['promoforge_refresh']
        self.assertTrue(cookie['secure'])
        self.assertTrue(cookie['httponly'])
        self.assertEqual(cookie['samesite'], 'Lax')
        self.assertEqual(cookie['path'], '/api/auth/')
        self.assertFalse(cookie['domain'])
        self.assertEqual(self.client.post('/api/auth/refresh/', {}, **origin).status_code, 200)
        self.assertEqual(self.client.post('/api/auth/logout/', {}, **origin).status_code, 205)

    def test_email_login_supports_django_accounts_and_shares_the_username_limit(self):
        self.account.username = 'cliente-django'
        self.account.save(update_fields=['username'])
        self.assertEqual(self.login(username=self.account.email, HTTP_ORIGIN='http://localhost:5173').status_code, 200)
        with patch('promoforge.views.LOGIN_ACCOUNT_LIMIT', (1, 900)):
            self.assertEqual(self.login(username=self.account.email, password='errada').status_code, 401)
            self.assertEqual(self.login(username=self.account.username, REMOTE_ADDR='192.0.2.126').status_code, 429)

    def test_client_ip_ignores_forwarded_headers_until_proxy_is_trusted(self):
        from ipaddress import ip_network

        request = RequestFactory().post('/', REMOTE_ADDR='192.0.2.10', HTTP_CF_CONNECTING_IP='203.0.113.1', HTTP_X_REAL_IP='203.0.113.2')
        self.assertEqual(client_ip(request), '192.0.2.10')
        with override_settings(TRUSTED_AUTH_PROXY_NETWORKS=(ip_network('192.0.2.10/32'),)):
            self.assertEqual(client_ip(request), '203.0.113.2')
        request.trusted_cloudflare_tunnel = True
        self.assertEqual(client_ip(request), '203.0.113.1')
