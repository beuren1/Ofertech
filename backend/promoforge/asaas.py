import json
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
    return (
        settings.ASAAS_ENVIRONMENT == 'sandbox'
        and bool(settings.ASAAS_API_KEY)
        and 32 <= len(token) <= 255
        and not any(char.isspace() for char in token)
        and token != settings.ASAAS_API_KEY
    )


def resource_id(value, prefix):
    return isinstance(value, str) and re.fullmatch(rf'{prefix}_[A-Za-z0-9_-]{{1,75}}', value) is not None


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
    try:
        with build_opener(NoRedirect()).open(req, timeout=5) as response:
            result = json.loads(response.read(1024 * 1024), parse_float=Decimal)
    except HTTPError as error:
        status = error.code
        error.close()
        raise AsaasError(status) from None
    except (URLError, OSError, HTTPException, ValueError):
        raise AsaasError() from None
    if not isinstance(result, dict):
        raise AsaasError()
    return result


def find_by_reference(path, reference):
    result = request(path, query={'externalReference': reference, 'limit': 2})
    rows = result.get('data')
    if not isinstance(rows, list) or len(rows) > 1 or result.get('hasMore'):
        raise AsaasError()
    if not rows:
        return None
    item = rows[0]
    if not isinstance(item, dict) or item.get('externalReference') != reference:
        raise AsaasError()
    return item
