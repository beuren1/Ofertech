import re
from urllib.parse import urlsplit

from django.core.exceptions import ImproperlyConfigured


def media_storage_settings(environ, *, on_render=False):
    r2_names = {
        'bucket_name': 'R2_BUCKET_NAME',
        'endpoint_url': 'R2_ENDPOINT_URL',
        'access_key': 'R2_ACCESS_KEY_ID',
        'secret_key': 'R2_SECRET_ACCESS_KEY',
    }
    legacy_names = {
        'bucket_name': 'DJANGO_S3_BUCKET_NAME',
        'endpoint_url': 'DJANGO_S3_ENDPOINT_URL',
        'access_key': 'DJANGO_S3_ACCESS_KEY_ID',
        'secret_key': 'DJANGO_S3_SECRET_ACCESS_KEY',
    }
    mode = environ.get('DJANGO_MEDIA_STORAGE', 'filesystem')
    if mode not in {'filesystem', 's3'}:
        raise ImproperlyConfigured('DJANGO_MEDIA_STORAGE deve ser filesystem ou s3.')
    if any(environ.get(name, '').strip() for name in r2_names.values()):
        names, region_name = r2_names, 'R2_REGION'
    elif mode == 's3':
        names, region_name = legacy_names, 'DJANGO_S3_REGION_NAME'
    elif on_render:
        names, region_name = r2_names, 'R2_REGION'
    else:
        return 'filesystem', {'BACKEND': 'django.core.files.storage.FileSystemStorage'}
    options = {key: environ.get(name, '').strip() for key, name in names.items()}
    missing = [names[key] for key, value in options.items() if not value]
    if missing:
        raise ImproperlyConfigured('Configuração de mídia S3 incompleta: ' + ', '.join(missing))
    try:
        endpoint = urlsplit(options['endpoint_url'])
        valid_endpoint = (
            endpoint.scheme == 'https' and endpoint.hostname and not endpoint.username
            and not endpoint.password and endpoint.path in ('', '/')
            and not endpoint.query and not endpoint.fragment
            and (endpoint.port is None or 1 <= endpoint.port <= 65535)
        )
    except ValueError:
        valid_endpoint = False
    if not valid_endpoint:
        raise ImproperlyConfigured(f"{names['endpoint_url']} deve ser a origem HTTPS da API S3, sem bucket, caminho ou credenciais.")
    if not re.fullmatch(r'[a-z0-9][a-z0-9.-]{1,61}[a-z0-9]', options['bucket_name']):
        raise ImproperlyConfigured(f"{names['bucket_name']} deve ser um nome de bucket S3 válido.")
    region = environ.get(region_name, 'auto').strip()
    if not region:
        raise ImproperlyConfigured(f'{region_name} não pode ser vazio.')
    options['region_name'] = region
    options['endpoint_url'] = options['endpoint_url'].rstrip('/')
    return 's3', {'BACKEND': 'promoforge.storage.PrivateS3Storage', 'OPTIONS': options}
