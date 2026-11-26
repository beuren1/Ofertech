import logging
from datetime import UTC, datetime, timedelta
from ipaddress import ip_address
from urllib.parse import urlencode
from uuid import uuid4

from django.conf import settings
from django.contrib.auth import get_user_model, password_validation
from django.contrib.auth.tokens import default_token_generator
from django.core.exceptions import ValidationError as DjangoValidationError
from django.core.mail import EmailMultiAlternatives
from django.db import transaction
from django.db.models import F
from django.template.loader import render_to_string
from django.utils import timezone
from django.utils.crypto import salted_hmac
from django.utils.encoding import force_bytes
from django.utils.http import urlsafe_base64_decode, urlsafe_base64_encode
from rest_framework import serializers
from rest_framework.exceptions import PermissionDenied, Throttled, ValidationError
from rest_framework_simplejwt.authentication import JWTAuthentication
from rest_framework_simplejwt.serializers import TokenRefreshSerializer
from rest_framework_simplejwt.token_blacklist.models import BlacklistedToken, OutstandingToken

from .models import AuthRateWindow, PasswordResetDelivery


logger = logging.getLogger(__name__)
User = get_user_model()

LOGIN_IP_LIMIT = (40, 15 * 60)
LOGIN_ACCOUNT_LIMIT = (8, 15 * 60)
RESET_REQUEST_IP_LIMIT = (20, 15 * 60)
RESET_EMAIL_HOURLY_LIMIT = (3, 60 * 60)
RESET_EMAIL_COOLDOWN = timedelta(minutes=5)
RESET_CONFIRM_IP_LIMIT = (30, 15 * 60)
RESET_CONFIRM_ACCOUNT_LIMIT = (10, 15 * 60)
RESET_MESSAGE = 'Se houver uma conta com esse e-mail, enviaremos um link para redefinir a senha.'
INVALID_LINK = 'Este link é inválido, já foi usado ou expirou. Solicite um novo link.'
MAX_MAIL_ATTEMPTS = 3


def parse_ip(value):
    if not value or '%' in value or '/' in value:
        return None
    try:
        address = ip_address(value.strip())
    except ValueError:
        return None
    return getattr(address, 'ipv4_mapped', None) or address


def client_ip(request):
    peer = parse_ip(request.META.get('REMOTE_ADDR'))
    if getattr(request, 'trusted_cloudflare_tunnel', False):
        return str(parse_ip(request.META.get('HTTP_CF_CONNECTING_IP')) or peer or 'unknown')
    if peer and any(peer in network for network in settings.TRUSTED_AUTH_PROXY_NETWORKS):
        return str(parse_ip(request.META.get('HTTP_X_REAL_IP')) or peer)
    return str(peer or 'unknown')


def check_auth_origin(request):
    origin = request.META.get('HTTP_ORIGIN')
    if origin and origin != f'{request.scheme}://{request.get_host()}' and origin not in settings.CORS_ALLOWED_ORIGINS:
        raise PermissionDenied('Origem da solicitação não autorizada.')


def login_username(identifier):
    if '@' not in identifier or User.objects.filter(username=identifier).exists():
        return identifier
    matches = list(User.objects.filter(email__iexact=identifier).values_list('username', flat=True)[:2])
    return matches[0] if len(matches) == 1 else identifier


def take_rate(scope, identity, rule, *, sliding=False):
    limit, seconds = rule
    now = timezone.now()
    timestamp = int(now.timestamp())
    slot = timestamp // seconds
    suffix = 'interval' if sliding else str(slot)
    key = salted_hmac('ofertei.auth.rate', f'{scope}\0{identity}\0{suffix}', algorithm='sha256').hexdigest()
    end = now + timedelta(seconds=seconds) if sliding else datetime.fromtimestamp((slot + 1) * seconds, UTC)
    with transaction.atomic():
        # Write before reading so concurrent SQLite workers do not upgrade a stale read lock.
        AuthRateWindow.objects.bulk_create([AuthRateWindow(key=key, expires_at=end)], ignore_conflicts=True)
        AuthRateWindow.objects.filter(pk=key, expires_at__lte=now).update(count=0, reported=False, expires_at=end)
        bucket = AuthRateWindow.objects.filter(pk=key)
        updated = bucket.filter(count__lt=limit).update(count=F('count') + 1)
        if not updated and bucket.filter(reported=False).update(reported=True):
            logger.warning('auth.rate_limited scope=%s', scope)
    return key if updated else None, max(1, int((end - now).total_seconds()))


def take_or_throttle(scope, identity, rule):
    key, wait = take_rate(scope, identity, rule)
    if not key:
        raise Throttled(wait=wait, detail='Muitas tentativas. Aguarde alguns minutos antes de tentar novamente.')
    return key


class PasswordBoundRefreshSerializer(TokenRefreshSerializer):
    def validate(self, attrs):
        token = self.token_class(attrs['refresh'])
        JWTAuthentication().get_user(token)
        return super().validate(attrs)


class ResetRequestInput(serializers.Serializer):
    email = serializers.EmailField(max_length=254)

    def validate_email(self, value):
        return value.strip().casefold()


class ResetConfirmInput(serializers.Serializer):
    uid = serializers.CharField(max_length=32)
    token = serializers.CharField(max_length=128, trim_whitespace=False)
    password = serializers.CharField(max_length=128, trim_whitespace=False, write_only=True)


def queue_reset(request, email):
    ip_key, _ = take_rate('reset-request-ip', client_ip(request), RESET_REQUEST_IP_LIMIT)
    if not ip_key:
        return
    key, _ = take_rate('reset-email-cooldown', email, (1, int(RESET_EMAIL_COOLDOWN.total_seconds())), sliding=True)
    if not key:
        return
    key, _ = take_rate('reset-email-hour', email, RESET_EMAIL_HOURLY_LIMIT)
    if key:
        PasswordResetDelivery.objects.create(email=email, available_at=timezone.now())


def parse_uid(encoded):
    try:
        uid = urlsafe_base64_decode(encoded).decode('ascii')
    except (ValueError, UnicodeError):
        return None
    if not uid.isdecimal() or len(uid) > 19:
        return None
    number = int(uid)
    return number if 0 < number <= 9223372036854775807 else None


@transaction.atomic
def apply_password_reset(user_id, token, password):
    if user_id is None:
        raise ValidationError({'detail': INVALID_LINK})
    # Locks the account before token validation, including on SQLite.
    User.objects.filter(pk=user_id, is_active=True).update(password=F('password'))
    user = User.objects.filter(pk=user_id, is_active=True).first()
    if not user or not user.has_usable_password() or not default_token_generator.check_token(user, token):
        raise ValidationError({'detail': INVALID_LINK})
    try:
        password_validation.validate_password(password, user)
    except DjangoValidationError as error:
        raise ValidationError({'password': list(error.messages)}) from None
    user.set_password(password)
    user.save(update_fields=['password'])
    outstanding = OutstandingToken.objects.filter(user=user, expires_at__gt=timezone.now()).values_list('pk', flat=True)
    BlacklistedToken.objects.bulk_create(
        [BlacklistedToken(token_id=token_id) for token_id in outstanding.iterator()], ignore_conflicts=True,
    )


def send_reset_email(email):
    users = list(User.objects.filter(is_active=True, email__iexact=email).order_by('pk')[:2])
    if len(users) != 1 or not users[0].has_usable_password():
        return
    user = users[0]
    fragment = urlencode({
        'uid': urlsafe_base64_encode(force_bytes(user.pk)),
        'token': default_token_generator.make_token(user),
    })
    context = {'link': f'{settings.PASSWORD_RESET_URL}#{fragment}', 'minutes': settings.PASSWORD_RESET_TIMEOUT // 60}
    message = EmailMultiAlternatives(
        'Redefina sua senha na Ofertech',
        render_to_string('promoforge/password_reset_email.txt', context),
        settings.DEFAULT_FROM_EMAIL,
        [user.email],
    )
    message.attach_alternative(render_to_string('promoforge/password_reset_email.html', context), 'text/html')
    if message.send() != 1:
        raise RuntimeError('E-mail não entregue.')


def process_reset_deliveries(limit=25):
    now = timezone.now()
    PasswordResetDelivery.objects.filter(created_at__lte=now - timedelta(minutes=30)).delete()
    AuthRateWindow.objects.filter(expires_at__lte=now).delete()
    ready = PasswordResetDelivery.objects.filter(available_at__lte=now, attempts__lt=MAX_MAIL_ATTEMPTS)
    for delivery in list(ready.order_by('pk')[:limit]):
        lease = uuid4()
        if not ready.filter(pk=delivery.pk).update(
            lease=lease, attempts=F('attempts') + 1, available_at=timezone.now() + timedelta(minutes=2),
        ):
            continue
        claimed = PasswordResetDelivery.objects.filter(pk=delivery.pk, lease=lease)
        try:
            send_reset_email(delivery.email)
        except Exception:
            logger.warning('auth.password_reset_delivery_failed')
            claimed.filter(attempts__gte=MAX_MAIL_ATTEMPTS).delete()
        else:
            claimed.delete()
