import os
from datetime import timedelta
from ipaddress import ip_network
from pathlib import Path
from urllib.parse import urlsplit
import dj_database_url

from dotenv import load_dotenv
from django.core.exceptions import ImproperlyConfigured
from .media_storage import media_storage_settings

BASE_DIR = Path(__file__).resolve().parent.parent
load_dotenv(BASE_DIR / '.env', encoding='utf-8-sig')


def env_bool(name):
    value = os.getenv(name, 'false').strip().lower()
    if value in {'1', 'true', 'yes', 'on'}:
        return True
    if value in {'0', 'false', 'no', 'off'}:
        return False
    raise ImproperlyConfigured(f'{name} deve conter um valor booleano.')


SECRET_KEY = os.getenv('DJANGO_SECRET_KEY', '').strip()
if len(SECRET_KEY) < 50 or len(set(SECRET_KEY)) < 5 or SECRET_KEY.startswith('django-insecure-'):
    raise ImproperlyConfigured('Configure DJANGO_SECRET_KEY com uma chave aleatória forte.')

DEBUG = env_bool('DJANGO_DEBUG')
ALLOWED_HOSTS = [host.strip() for host in os.getenv('DJANGO_ALLOWED_HOSTS', 'localhost,127.0.0.1').split(',') if host.strip()]
ON_RENDER = env_bool('RENDER')
RENDER_HOST = os.getenv('RENDER_EXTERNAL_HOSTNAME', '').strip().lower()
if ON_RENDER:
    if DEBUG or any(host == '*' or host.startswith('.') for host in ALLOWED_HOSTS):
        raise ImproperlyConfigured('O Render exige DJANGO_DEBUG=False e hosts explícitos.')
    if RENDER_HOST and RENDER_HOST not in ALLOWED_HOSTS:
        ALLOWED_HOSTS.append(RENDER_HOST)

TUNNEL_HOST = os.getenv('DJANGO_TUNNEL_HOST', '').strip().lower()
if ON_RENDER and TUNNEL_HOST:
    raise ImproperlyConfigured('Remova a configuração do túnel Cloudflare do serviço Render.')
if TUNNEL_HOST and (DEBUG or TUNNEL_HOST not in ALLOWED_HOSTS or any(
    host == '*' or host.startswith('.') for host in ALLOWED_HOSTS
)):
    raise ImproperlyConfigured('O túnel exige DJANGO_DEBUG=False e hosts explícitos em DJANGO_ALLOWED_HOSTS.')

SECURE_SSL_REDIRECT = ON_RENDER or bool(TUNNEL_HOST)
SECURE_PROXY_SSL_HEADER = ('HTTP_X_FORWARDED_PROTO', 'https') if SECURE_SSL_REDIRECT else None
SECURE_REDIRECT_EXEMPT = [r'^api/health/$'] if ON_RENDER else []
SECURE_HSTS_SECONDS = int(os.getenv('DJANGO_HSTS_SECONDS', '300')) if SECURE_SSL_REDIRECT else 0
SESSION_COOKIE_SECURE = SECURE_SSL_REDIRECT
CSRF_COOKIE_SECURE = SECURE_SSL_REDIRECT

INSTALLED_APPS = [
    'django.contrib.admin',
    'django.contrib.auth',
    'django.contrib.contenttypes',
    'django.contrib.sessions',
    'django.contrib.messages',
    'django.contrib.staticfiles',
    'rest_framework',
    'rest_framework_simplejwt',
    'rest_framework_simplejwt.token_blacklist',
    'corsheaders',
    'promoforge',
]

MIDDLEWARE = [
    'django.middleware.security.SecurityMiddleware',
    'corsheaders.middleware.CorsMiddleware',
    'django.middleware.common.CommonMiddleware',
    'django.middleware.csrf.CsrfViewMiddleware',
    'django.contrib.sessions.middleware.SessionMiddleware',
    'django.contrib.auth.middleware.AuthenticationMiddleware',
    'django.contrib.messages.middleware.MessageMiddleware',
    'django.middleware.clickjacking.XFrameOptionsMiddleware',
]
if ON_RENDER:
    MIDDLEWARE.insert(1, 'whitenoise.middleware.WhiteNoiseMiddleware')
if TUNNEL_HOST:
    MIDDLEWARE.insert(0, 'config.middleware.CloudflareTunnelMiddleware')

ROOT_URLCONF = 'config.urls'
TEMPLATES = [{
    'BACKEND': 'django.template.backends.django.DjangoTemplates',
    'DIRS': [],
    'APP_DIRS': True,
    'OPTIONS': {'context_processors': [
        'django.template.context_processors.request',
        'django.contrib.auth.context_processors.auth',
        'django.contrib.messages.context_processors.messages',
    ]},
}]
WSGI_APPLICATION = 'config.wsgi.application'

DATABASES = {
    'default': dj_database_url.config(
        default='sqlite:///db.sqlite3',
        env='DATABASE_URL',
        conn_max_age=600,
        conn_health_checks=True,
    )
}
if ON_RENDER:
    database = DATABASES['default']
    if database['ENGINE'] != 'django.db.backends.postgresql' or not database.get('HOST') or not database.get('NAME'):
        raise ImproperlyConfigured('Configure DATABASE_URL com o PostgreSQL do Render.')
    database.setdefault('OPTIONS', {}).setdefault('connect_timeout', 3)

AUTH_PASSWORD_VALIDATORS = [
    {'NAME': 'django.contrib.auth.password_validation.UserAttributeSimilarityValidator'},
    {'NAME': 'django.contrib.auth.password_validation.MinimumLengthValidator'},
    {'NAME': 'django.contrib.auth.password_validation.CommonPasswordValidator'},
    {'NAME': 'django.contrib.auth.password_validation.NumericPasswordValidator'},
]

LANGUAGE_CODE = 'pt-br'
TIME_ZONE = 'America/Sao_Paulo'
USE_I18N = True
USE_TZ = True
STATIC_URL = '/static/'
STATIC_ROOT = BASE_DIR / 'staticfiles'
MEDIA_URL = '/media/'
MEDIA_ROOT = Path(os.getenv('DJANGO_MEDIA_ROOT', BASE_DIR / 'media'))
MEDIA_STORAGE_MODE, MEDIA_STORAGE_CONFIG = media_storage_settings(os.environ, on_render=ON_RENDER)
STORAGES = {
    'default': MEDIA_STORAGE_CONFIG,
    'staticfiles': {'BACKEND': 'whitenoise.storage.CompressedManifestStaticFilesStorage' if ON_RENDER
                    else 'django.contrib.staticfiles.storage.StaticFilesStorage'},
}
DEFAULT_AUTO_FIELD = 'django.db.models.BigAutoField'

REST_FRAMEWORK = {
    'DEFAULT_AUTHENTICATION_CLASSES': (
        'rest_framework_simplejwt.authentication.JWTAuthentication',
    ),
    'DEFAULT_PERMISSION_CLASSES': (
        'rest_framework.permissions.IsAuthenticated',
    ),
    'DEFAULT_PAGINATION_CLASS': 'rest_framework.pagination.PageNumberPagination',
    'PAGE_SIZE': 20,
}

SIMPLE_JWT = {
    'ACCESS_TOKEN_LIFETIME': timedelta(minutes=30),
    'REFRESH_TOKEN_LIFETIME': timedelta(days=7),
    'AUTH_HEADER_TYPES': ('Bearer',),
    'CHECK_REVOKE_TOKEN': True,
}

PASSWORD_RESET_TIMEOUT = 30 * 60
EMAIL_BACKEND = os.getenv('DJANGO_EMAIL_BACKEND', 'django.core.mail.backends.locmem.EmailBackend')
EMAIL_FILE_PATH = Path(os.getenv('DJANGO_EMAIL_FILE_PATH', BASE_DIR / 'mailbox'))
EMAIL_HOST = os.getenv('DJANGO_EMAIL_HOST', 'localhost')
EMAIL_PORT = int(os.getenv('DJANGO_EMAIL_PORT', '587'))
EMAIL_HOST_USER = os.getenv('DJANGO_EMAIL_HOST_USER', '')
EMAIL_HOST_PASSWORD = os.getenv('DJANGO_EMAIL_HOST_PASSWORD', '')
EMAIL_USE_SSL = env_bool('DJANGO_EMAIL_USE_SSL')
EMAIL_USE_TLS = env_bool('DJANGO_EMAIL_USE_TLS') if 'DJANGO_EMAIL_USE_TLS' in os.environ else not EMAIL_USE_SSL
EMAIL_TIMEOUT = 10
DEFAULT_FROM_EMAIL = os.getenv('DJANGO_DEFAULT_FROM_EMAIL', 'Ofertei <no-reply@localhost>')
reset_url_from_env = os.getenv('DJANGO_PASSWORD_RESET_URL', '').strip()
PASSWORD_RESET_URL = reset_url_from_env or 'http://localhost:5173/reset-password'
try:
    reset_url = urlsplit(PASSWORD_RESET_URL)
    valid_reset_url = (
        reset_url.hostname and not reset_url.username and not reset_url.password
        and not reset_url.query and not reset_url.fragment and reset_url.path == '/reset-password'
        and not any(character.isspace() or character in '\\?#' for character in PASSWORD_RESET_URL)
        and (reset_url.port is None or reset_url.port > 0)
        and (reset_url.scheme == 'https' or (
            reset_url.scheme == 'http' and reset_url.hostname in {'localhost', '127.0.0.1', '::1'}
        ))
    )
except ValueError:
    valid_reset_url = False
if not valid_reset_url or (EMAIL_BACKEND.endswith('.smtp.EmailBackend') and (
    not reset_url_from_env or reset_url.scheme != 'https' or not (EMAIL_USE_SSL or EMAIL_USE_TLS)
)):
    raise ImproperlyConfigured('Configure a URL pública HTTPS de recuperação e TLS ou SSL para SMTP.')
if EMAIL_USE_SSL and EMAIL_USE_TLS:
    raise ImproperlyConfigured('Use apenas TLS ou SSL para SMTP.')
if EMAIL_BACKEND == 'django.core.mail.backends.console.EmailBackend':
    raise ImproperlyConfigured('Para recuperação de senha, use um backend de e-mail que preserve o sigilo dos links.')

try:
    TRUSTED_AUTH_PROXY_NETWORKS = tuple(
        ip_network(entry.strip()) for entry in os.getenv('DJANGO_TRUSTED_AUTH_PROXY_NETWORKS', '').split(',')
        if entry.strip()
    )
except ValueError as error:
    raise ImproperlyConfigured('Informe IPs ou redes válidas de proxies confiáveis.') from error
if any(network.prefixlen == 0 for network in TRUSTED_AUTH_PROXY_NETWORKS):
    raise ImproperlyConfigured('A lista de proxies de autenticação exige redes restritas.')

CORS_ALLOWED_ORIGINS = [] if ON_RENDER else [
    'http://localhost:5173',
    'http://127.0.0.1:5173',
]
for origin in os.getenv('DJANGO_CORS_ALLOWED_ORIGINS', '').split(','):
    origin = origin.strip().rstrip('/')
    if not origin:
        continue
    try:
        parsed_origin = urlsplit(origin)
        valid_origin = (
            parsed_origin.scheme == 'https' and parsed_origin.hostname
            and parsed_origin.username is None and parsed_origin.password is None
            and not parsed_origin.path and not parsed_origin.query and not parsed_origin.fragment
            and '*' not in origin and not any(char.isspace() for char in origin)
            and (parsed_origin.port is None or parsed_origin.port > 0)
        )
    except ValueError:
        valid_origin = False
    if not valid_origin:
        raise ImproperlyConfigured('DJANGO_CORS_ALLOWED_ORIGINS deve conter apenas origens HTTPS explícitas.')
    CORS_ALLOWED_ORIGINS.append(origin)
CORS_ALLOW_CREDENTIALS = True

MP_ACCESS_TOKEN = os.getenv('MP_ACCESS_TOKEN', '').strip()
MP_MODE = os.getenv('MP_MODE', 'test').strip().lower()
if MP_MODE not in {'off', 'test'}:
    raise ImproperlyConfigured('MP_MODE aceita off ou test. O checkout comercial ainda não está habilitado.')
MP_TEST_SELLER_ID = os.getenv('MP_TEST_SELLER_ID', '').strip()
MP_TEST_BUYER_EMAIL = os.getenv('MP_TEST_BUYER_EMAIL', '').strip().lower()
MP_WEBHOOK_SECRET = os.getenv('MP_WEBHOOK_SECRET', '').strip()
MP_BACK_URL = os.getenv('MP_BACK_URL', '').strip()
