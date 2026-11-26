from django.conf import settings
from django.core.exceptions import DisallowedHost


class CloudflareTunnelMiddleware:
    def __init__(self, get_response):
        self.get_response = get_response

    def __call__(self, request):
        # cloudflared connects to the dedicated loopback listener and Cloudflare
        # replaces the visitor's X-Forwarded-Proto header at the edge.
        if (
            request.META.get('REMOTE_ADDR') not in {'127.0.0.1', '::1'}
            or request.get_host().lower() != settings.TUNNEL_HOST
        ):
            raise DisallowedHost('A requisição não veio pela origem configurada do túnel.')
        if request.META.get('HTTP_X_FORWARDED_PROTO') not in {'http', 'https'}:
            request.META.pop('HTTP_X_FORWARDED_PROTO', None)
        request.trusted_cloudflare_tunnel = True
        return self.get_response(request)
