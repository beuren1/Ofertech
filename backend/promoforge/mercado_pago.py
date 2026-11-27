import json
import logging
import re
from hashlib import sha256
from hmac import compare_digest, new as hmac_new
from http.client import HTTPException
from urllib.error import HTTPError, URLError
from urllib.parse import urlsplit
from urllib.request import HTTPRedirectHandler, Request, build_opener

from django.conf import settings
from rest_framework.exceptions import APIException


logger = logging.getLogger(__name__)
SAFE_PROVIDER_ERROR_TYPES = {
    'bad_request', 'forbidden', 'internal_error', 'internal_server_error',
    'invalid_access_token', 'invalid_credentials', 'invalid_token', 'not_found',
    'PA_UNAUTHORIZED_RESULT_FROM_POLICIES', 'service_unavailable',
    'too_many_requests', 'unauthorized', 'unprocessable_entity', 'validation_error',
}


class MercadoPagoUnavailable(APIException):
    status_code = 503
    default_detail = 'O checkout de teste do Mercado Pago está indisponível.'


class MercadoPagoError(APIException):
    status_code = 502
    default_detail = 'Não foi possível confirmar a operação com o Mercado Pago.'

    def __init__(self, remote_status=None, *, error_type=None, operation='validation'):
        self.remote_status = remote_status
        if error_type is not None:
            logger.warning('Mercado Pago: operation=%s http_status=%s error_type=%s', operation, remote_status, error_type)
        super().__init__()


class NoRedirects(HTTPRedirectHandler):
    def redirect_request(self, req, fp, code, msg, headers, newurl):
        return None


def provider_error_type(error):
    try:
        with error:
            payload = json.loads(error.read(8192))
    except (HTTPException, OSError, ValueError):
        return 'upstream_http_error'
    if isinstance(payload, dict):
        for name in ('error', 'code', 'type'):
            value = payload.get(name)
            if isinstance(value, str) and value in SAFE_PROVIDER_ERROR_TYPES:
                return value
            if name == 'code' and type(value) is int and 100 <= value <= 599:
                return value
    return 'upstream_http_error'


def configuration_blockers():
    blockers = []
    if settings.MP_MODE != 'test':
        blockers.append('mode_disabled')
    if not settings.MP_ACCESS_TOKEN:
        blockers.append('access_token_missing')
    if not settings.MP_WEBHOOK_SECRET:
        blockers.append('webhook_secret_missing')
    if not settings.MP_TEST_SELLER_ID.isdecimal():
        blockers.append('test_seller_invalid')
    if not settings.MP_TEST_BUYER_EMAIL.endswith('@testuser.com'):
        blockers.append('test_buyer_invalid')
    try:
        back_url = urlsplit(settings.MP_BACK_URL)
        valid_back_url = back_url.scheme == 'https' and back_url.hostname and not back_url.username
    except ValueError:
        valid_back_url = False
    if not valid_back_url:
        blockers.append('return_url_invalid')
    return blockers


def configured():
    return not configuration_blockers()


def matches_test_buyer(user):
    return user.email.lower() == settings.MP_TEST_BUYER_EMAIL


def checkout_blockers(user):
    blockers = configuration_blockers()
    if 'test_buyer_invalid' not in blockers and not matches_test_buyer(user):
        blockers.append('buyer_mismatch')
    return blockers


def request_mp(path, method='GET', body=None, *, identity=False):
    if not configured():
        raise MercadoPagoUnavailable()
    base = 'https://api.mercadolibre.com' if identity else 'https://api.mercadopago.com'
    operation = 'seller_identity' if identity else 'create_subscription' if path == '/preapproval' and method == 'POST' else 'provider_request'
    headers = {'Authorization': f'Bearer {settings.MP_ACCESS_TOKEN}', 'Accept': 'application/json'}
    if body is not None:
        headers['Content-Type'] = 'application/json'
    request = Request(
        base + path, method=method, headers=headers,
        data=json.dumps(body).encode() if body is not None else None,
    )
    status = None
    try:
        with build_opener(NoRedirects()).open(request, timeout=6) as response:
            status = response.status
            data = json.load(response)
    except HTTPError as error:
        raise MercadoPagoError(error.code, error_type=provider_error_type(error), operation=operation) from None
    except (HTTPException, OSError) as error:
        reason = error.reason if isinstance(error, URLError) else error
        error_type = 'upstream_timeout' if isinstance(reason, TimeoutError) else 'upstream_transport_error'
        raise MercadoPagoError(status, error_type=error_type, operation=operation) from None
    except ValueError:
        raise MercadoPagoError(status, error_type='upstream_invalid_json', operation=operation) from None
    if not isinstance(data, dict):
        raise MercadoPagoError(status, error_type='upstream_unexpected_payload', operation=operation)
    return data


def verify_test_seller():
    user = request_mp('/users/me', identity=True)
    if (
        str(user.get('id')) != settings.MP_TEST_SELLER_ID
        or 'test_user' not in (user.get('tags') or [])
    ):
        logger.warning('Mercado Pago: operation=seller_identity error_type=test_seller_mismatch')
        raise MercadoPagoUnavailable()


def safe_checkout(url):
    if not isinstance(url, str) or len(url) > 500:
        return ''
    try:
        parsed = urlsplit(url)
    except ValueError:
        return ''
    if (
        parsed.scheme == 'https'
        and parsed.netloc in {'www.mercadopago.com.br', 'www.mercadopago.com.ar', 'www.mercadopago.com'}
        and parsed.path == '/subscriptions/checkout'
    ):
        return url
    return ''


def resource_id(value):
    string = str(value or '')
    return string if re.fullmatch(r'[A-Za-z0-9_-]{1,128}', string) else ''


def signed_resource(request):
    resource = resource_id(request.query_params.get('data.id'))
    request_id = request.headers.get('x-request-id', '')
    fields = {}
    for item in request.headers.get('x-signature', '').split(','):
        key, sep, value = item.strip().partition('=')
        if sep:
            fields[key] = value.strip()
    timestamp = fields.get('ts', '')
    signature = fields.get('v1', '')
    if (
        not settings.MP_WEBHOOK_SECRET
        or not resource
        or not request_id
        or not re.fullmatch(r'[0-9]{1,16}', timestamp)
        or not re.fullmatch(r'[0-9a-fA-F]{64}', signature)
    ):
        return ''
    manifest = f'id:{resource.lower()};request-id:{request_id};ts:{timestamp};'
    expected = hmac_new(settings.MP_WEBHOOK_SECRET.encode(), manifest.encode(), sha256).hexdigest()
    return resource if compare_digest(expected, signature.lower()) else ''

