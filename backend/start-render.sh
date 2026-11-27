#!/usr/bin/env sh
set -eu

: "${RENDER_EXTERNAL_HOSTNAME:?Host público do serviço Render ausente.}"
python manage.py check_media_storage
# Render Free não oferece a etapa de pre-deploy.
python manage.py migrate --noinput

exec gunicorn config.wsgi:application --bind "0.0.0.0:${PORT:-10000}"
