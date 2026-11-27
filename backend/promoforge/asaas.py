import json
import logging
import re
from decimal import Decimal
from http.client import HTTPException
from urllib.error import HTTPError, URLError
from urllib.parse import urlencode
from urllib.request import HTTPRedirectHandler, Request, build_opener

from django.conf import settings
from rest_framework.exceptions import APIException


ENDPOINTS = {
    'sandbox': 'https://api-sandbox.asaas.com/v3',
    'production': 'https://api.asaas.com/v3',
}
logger = logging.getLogger(__name__)
SAFE_ERROR_CODES = {
    'access_token_not_found', 'invalid_access_token', 'invalid_access_token_format',
    'invalid_environment', 'invalid_object', 'invalid_value', 'invalid_dueDate',
    'invalid_cpfCnpj', 'invalid_name', 'invalid_customer', 'invalid_billingType',
    'forbidden', 'unauthorized', 'internal_error', 'rate_limit_exceeded',
}


class AsaasUnavailable(APIException):
    status_code = 503
    default_detail = 'Pix de teste indisponível no momento.'


class AsaasError(APIException):
    status_code = 502
    default_detail = 'Não foi possível concluir a consulta ao Asaas. Tente consultar o pedido novamente.'

    def __init__(self, remote_status=None):
        super().__init__()
        self.remote_status = remote_status


class NoRedirect(HTTPRedirectHandler):
    def redirect_request(self, *args, **kwargs):
        return None


def enabled():
    token = settings.ASAAS_WEBHOOK_TOKEN
    key = settings.ASAAS_API_KEY
    return (
        settings.ASAAS_ENVIRONMENT == 'sandbox'
        and bool(key)
        and key.isascii()
        and key.isprintable()
        and not any(char.isspace() for char in key)
        and not key.startswith('$aact_prod_')
        and 32 <= len(token) <= 255
        and not any(char.isspace() for char in token)
        and token != key
    )


def resource_id(value, prefix):
    return isinstance(value, str) and re.fullmatch(rf'{prefix}_[A-Za-z0-9_-]{{1,75}}', value) is not None


def operation_name(method, path):
    if path in {'/customers', '/payments'}:
        return f'{method} {path}'
    if path.endswith('/pixQrCode'):
        return 'GET /payments/{id}/pixQrCode'
    return f'{method} /payments/{{id}}'


def log_failure(operation, failure, *, status=None, codes=()):
    logger.warning(
        'asaas.request_failed operation=%s failure=%s upstream_status=%s codes=%s',
        operation, failure, status if status is not None else '-', ','.join(codes) or '-',
    )


def error_codes(error):
    try:
        payload = json.loads(error.read(16384))
    except (OSError, HTTPException, ValueError, RecursionError):
        return ()
    errors = payload.get('errors') if isinstance(payload, dict) else None
    if not isinstance(errors, list):
        return ()
    codes = []
    for item in errors[:16]:
        code = item.get('code') if isinstance(item, dict) else None
        if isinstance(code, str):
            codes.append(code if code in SAFE_ERROR_CODES else 'unrecognized_code')
    return sorted(set(codes))


def request(path, method='GET', data=None, *, query=None):
    if not enabled():
        raise AsaasUnavailable()
    url = ENDPOINTS[settings.ASAAS_ENVIRONMENT] + path
    if query:
        url += '?' + urlencode(query)
    req = Request(url, method=method, data=json.dumps(data).encode() if data is not None else None, headers={
        'access_token': settings.ASAAS_API_KEY,
        'User-Agent': 'Ofertech/1.0',
        'Accept': 'application/json',
        'Content-Type': 'application/json',
    })
    operation = operation_name(method, path)
    status = None
    try:
        with build_opener(NoRedirect()).open(req, timeout=5) as response:
            status = response.status
            result = json.loads(response.read(1024 * 1024), parse_float=Decimal)
    except HTTPError as error:
        with error:
            log_failure(operation, 'http_error', status=error.code, codes=error_codes(error))
        raise AsaasError(error.code) from None
    except (URLError, OSError, HTTPException):
        log_failure(operation, 'transport_error', status=status)
        raise AsaasError() from None
    except (ValueError, RecursionError):
        log_failure(operation, 'invalid_response', status=status)
        raise AsaasError() from None
    if not isinstance(result, dict):
        log_failure(operation, 'invalid_response', status=status)
        raise AsaasError()
    return result


def find_by_reference(path, reference):
    result = request(path, query={'externalReference': reference, 'limit': 2})
    rows = result.get('data')
    if not isinstance(rows, list) or len(rows) > 1 or result.get('hasMore'):
        log_failure(operation_name('GET', path), 'unexpected_reference_list')
        raise AsaasError()
    if not rows:
        return None
    item = rows[0]
    if not isinstance(item, dict) or item.get('externalReference') != reference:
        log_failure(operation_name('GET', path), 'unexpected_reference')
        raise AsaasError()
    return item
