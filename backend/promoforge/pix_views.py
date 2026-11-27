from django.conf import settings
from django.shortcuts import get_object_or_404
from django.utils.decorators import method_decorator
from django.views.decorators.cache import never_cache
from rest_framework.permissions import AllowAny, IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from . import asaas, pix_billing
from .auth_security import client_ip, take_or_throttle
from .billing_models import PixOrder, Plan


@method_decorator(never_cache, name='dispatch')
class PixOrdersView(APIView):
    permission_classes = [IsAuthenticated]

    def post(self, request):
        take_or_throttle('pix-create', request.user.pk, (8, 300))
        take_or_throttle('pix-create-ip', client_ip(request), (30, 300))
        form = pix_billing.PixInput(data=request.data)
        form.is_valid(raise_exception=True)
        data = form.validated_data
        plan = get_object_or_404(Plan, pk=data['plan'])
        return Response(pix_billing.order_data(pix_billing.start_order(request.user, plan, data)), status=202)


@method_decorator(never_cache, name='dispatch')
class PixOrderView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request, order_id):
        take_or_throttle('pix-status', request.user.pk, (30, 60))
        return Response(pix_billing.order_data(self.order(request, order_id)))

    def post(self, request, order_id, action):
        order = self.order(request, order_id)
        if not asaas.configured():
            raise asaas.AsaasUnavailable()
        take_or_throttle('pix-provider', request.user.pk, (8, 60))
        if action == 'qr':
            return Response(pix_billing.get_qr(order))
        if action in ('refresh', 'cancel'):
            if action == 'cancel' and not pix_billing.order_data(order)['can_cancel']:
                raise pix_billing.PixConflict('Esta cobrança não pode ser cancelada agora.')
            return Response(pix_billing.order_data(pix_billing.reconcile(order, cancel=action == 'cancel')))
        return Response(status=404)

    def order(self, request, order_id):
        return get_object_or_404(
            PixOrder.objects.select_related('subscription__user', 'plan'),
            pk=order_id, subscription__user=request.user, environment=settings.ASAAS_ENVIRONMENT,
        )


class AsaasWebhookView(APIView):
    permission_classes = [AllowAny]
    authentication_classes = []

    def post(self, request, environment='sandbox'):
        token = request.headers.get('asaas-access-token', '')
        if not pix_billing.verify_token(token, environment):
            take_or_throttle('pix-webhook-invalid', client_ip(request), (30, 60))
            return Response(status=401)
        data = request.data
        if not isinstance(data, dict):
            return Response(status=400)
        event = data.get('event')
        if not isinstance(event, str) or not event.startswith('PAYMENT_'):
            return Response(status=200)
        event_id = data.get('id')
        payment = data.get('payment')
        if not isinstance(event_id, str) or not 1 <= len(event_id) <= 128 or not isinstance(payment, dict):
            return Response(status=400)
        order = pix_billing.webhook_order(payment)
        if order:
            pix_billing.reconcile(order, event_id=event_id, payment_id=payment['id'])
        return Response(status=200)
