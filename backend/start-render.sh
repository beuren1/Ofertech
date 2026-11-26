#!/usr/bin/env sh
set -eu

: "${RENDER_EXTERNAL_HOSTNAME:?Host público do serviço Render ausente.}"
if [ -z "${DJANGO_MEDIA_ROOT:-}" ] || ! mountpoint -q "$DJANGO_MEDIA_ROOT" || [ ! -w "$DJANGO_MEDIA_ROOT" ]; then
    echo 'Configure DJANGO_MEDIA_ROOT com o ponto de montagem gravável do disco persistente.' >&2
    exit 1
fi

python manage.py migrate --check
exec gunicorn config.wsgi:application --bind "0.0.0.0:${PORT:-10000}"
