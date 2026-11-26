from contextlib import contextmanager
from datetime import datetime
from hashlib import sha256
import re
from time import sleep
from uuid import UUID
from zipfile import BadZipFile, ZipFile
from zoneinfo import ZoneInfo

from django.conf import settings
from django.db import connection, OperationalError, transaction
from django.db.models import F, Sum
from django.shortcuts import get_object_or_404
from django.utils import timezone
from rest_framework.exceptions import APIException, ValidationError
from rest_framework import serializers
from rest_framework.permissions import AllowAny, IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from .billing_models import CreditMovement, Plan, Subscription
from .entitlements import COSTS, authorize_operation, plan_costs, plan_rules, require_feature


def current_period():
    return datetime.now(ZoneInfo(settings.TIME_ZONE)).date().replace(day=1)


@contextmanager
def billing_account(user, *, refresh_allowance=True):
    account, _ = Subscription.objects.get_or_create(user=user, defaults={'plan_id': 'free'})
    with transaction.atomic():
        # Acquire the write lock before reading the balance, including on SQLite.
        Subscription.objects.filter(pk=account.pk).update(credits=F('credits'))
        account.refresh_from_db()
        if not refresh_allowance:
            yield account
            return
        today = timezone.localdate()
        if account.plan_id == 'free' or not account.paid_until or account.paid_until <= today:
            from .recurring import apply_due_invoice

            apply_due_invoice(account, today)
        period = current_period()
        expired = account.plan_id != 'free' and (
            account.paid_until is None or account.paid_until <= today
        )
        if expired:
            account.plan_id = 'free'
            account.cancel_at_period_end = False
        if account.plan_id == 'free' and (expired or account.period is None or account.period < period):
            account.period = period
            account.monthly_limit = account.plan.monthly_credits
            key = f'period:{period}'
            movement, created = CreditMovement.objects.get_or_create(
                subscription=account, key=key,
                defaults={'kind': 'renewal', 'amount': account.monthly_limit, 'balance': account.monthly_limit},
            )
            account.credits = movement.balance if created else 0
            account.save()
        yield account


def plan_data(plan):
    return {
        'code': plan.code, 'name': plan.name, 'monthly_credits': plan.monthly_credits,
        'monthly_price': str(plan.monthly_price),
        'limits': plan_rules(plan.code), 'costs': plan_costs(plan.code),
    }


class PlansView(APIView):
    permission_classes = [AllowAny]

    def get(self, request):
        return Response([plan_data(plan) for plan in Plan.objects.order_by('monthly_price', 'code')])


class BillingView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        from .mercado_pago import configured
        from .recurring import open_change

        with billing_account(request.user) as account:
            history = CreditMovement.objects.filter(subscription=account).order_by('-pk')
            cycle_start = history.filter(kind='renewal').values_list('pk', flat=True).first() or 0
            used = -(history.filter(kind__in=('generation', *COSTS), pk__gt=cycle_start, amount__lt=0).aggregate(total=Sum('amount'))['total'] or 0)
            change = open_change(account) or account.planchange_set.filter(
                expected_amount__isnull=False,
            ).order_by('-pk').first()
            invoice = change.invoices.order_by('-due_on', '-provider_id').first() if change else None
            payment_state = invoice.status if invoice else None
            paid_until = account.paid_until if change and account.paid_change_id == change.pk else None
            today = timezone.localdate()
            overdue = bool(
                change and change.status == 'authorized' and (
                    (invoice and invoice.status != 'approved' and invoice.due_on < today
                     and (not paid_until or invoice.due_on >= paid_until))
                    or (paid_until and paid_until <= today)
                )
            )
            return Response({
                'plan': plan_data(account.plan), 'credits': account.credits,
                'monthly_limit': account.monthly_limit, 'used': used,
                'period': account.period, 'cancel_at_period_end': account.cancel_at_period_end,
                'checkout_available': configured(),
                'subscription_plan': change.plan_id if change else None,
                'subscription_status': change.status if change else None,
                'payment_status': payment_state,
                'payment_overdue': overdue,
                'paid_until': account.paid_until if account.plan_id != 'free' else None,
                'history': list(history.values('id', 'kind', 'amount', 'balance', 'created_at')[:100]),
            })


class PlanChangeView(APIView):
    permission_classes = [IsAuthenticated]

    def post(self, request):
        from .recurring import cancel_subscription, start_checkout

        code = request.data.get('plan')
        if not isinstance(code, str):
            raise ValidationError({'plan': 'Selecione um plano.'})
        plan = get_object_or_404(Plan, pk=code)
        if code == 'free':
            with billing_account(request.user) as account:
                cancel_subscription(account)
                return Response({'cancel_at_period_end': account.cancel_at_period_end})
        change = start_checkout(request.user, plan)
        return Response({
            'status': change.status,
            'checkout_url': change.checkout_url if change.status == 'pending_payment' else None,
        }, status=202)


class MercadoPagoWebhookView(APIView):
    permission_classes = [AllowAny]
    authentication_classes = []

    def post(self, request):
        from .mercado_pago import signed_resource, verify_test_seller
        from .recurring import process_agreement, process_invoice

        resource = signed_resource(request)
        if not resource:
            return Response(status=401)
        if not isinstance(request.data, dict):
            return Response(status=400)
        event = request.data.get('type')
        if isinstance(event, str):
            if event == 'subscription_preapproval':
                verify_test_seller()
                process_agreement(resource)
            elif event == 'subscription_authorized_payment' and resource.isascii() and resource.isdecimal() and len(resource) <= 40:
                verify_test_seller()
                process_invoice(resource)
        return Response(status=200)


class InsufficientCredits(APIException):
    status_code = 409
    default_detail = 'Créditos insuficientes. Consulte Planos e créditos para ver as opções.'
    default_code = 'insufficient_credits'


ARTWORK_ENDINGS = {
    'image/png': bytes.fromhex('0000000049454e44ae426082'),
    'image/jpeg': bytes.fromhex('ffd9'),
}


class ArtworkCreditsView(APIView):
    permission_classes = [IsAuthenticated]

    def post(self, request):
        from .views import validate_image_upload

        try:
            key = f"art:{UUID(str(request.data.get('key')))}"
            count = int(str(request.data.get('count')))
        except (ValueError, TypeError):
            raise ValidationError('Identificador ou quantidade inválida.')
        if not 1 <= count <= 1000:
            raise ValidationError('Quantidade de artes inválida.')
        files = request.FILES.getlist('file')
        requested_format = request.data.get('format', 'png')
        if requested_format not in ('png', 'jpeg'):
            raise ValidationError('Formato inválido para banners.')
        format = 'jpeg' if requested_format == 'jpeg' or any(f.content_type == 'image/jpeg' for f in files) else 'png'
        if files and len(files) != count:
            raise ValidationError('Envie uma imagem para cada arte concluída.')
        digest = sha256()
        for upload in files:
            validate_image_upload(upload, verify_signature=True)
            ending = ARTWORK_ENDINGS.get(upload.content_type)
            if not ending or upload.size <= len(ending):
                raise ValidationError('Envie uma arte em PNG ou JPG.')
            upload.seek(upload.size - len(ending))
            if upload.read(len(ending)) != ending:
                raise ValidationError('A imagem enviada está incompleta.')
            digest.update(upload.size.to_bytes(8, 'big'))
            for chunk in upload.chunks():
                digest.update(chunk)
        payload_hash = digest.hexdigest() if files else ''
        with billing_account(request.user) as account:
            authorize_operation(account.plan_id, 'banner', count, format)
            if request.data.get('bulk') in (True, 'true'):
                require_feature(account.plan_id, 'bulk')
            if request.data.get('premium') in (True, 'true'):
                require_feature(account.plan_id, 'premium')
            movement = CreditMovement.objects.filter(subscription=account, key=key).first()
            if movement:
                if files and (movement.amount != -count or movement.payload_hash != payload_hash):
                    raise ValidationError('Esta geração já foi registrada com outras imagens.')
                return Response({'credits': account.credits})
            if account.credits < count:
                raise InsufficientCredits()
            if files:
                account.credits -= count
                account.save(update_fields=['credits'])
                CreditMovement.objects.create(
                    subscription=account, key=key, kind='generation',
                    amount=-count, balance=account.credits, payload_hash=payload_hash,
                )
            return Response({'credits': account.credits})


OPERATION_FORMATS = {
    'flyer': ('png', 'pdf', 'zip'), 'poster': ('png', 'pdf', 'zip'),
    'labels': ('png', 'pdf', 'zip'), 'video': ('mp4', 'webm'), 'cutout': ('png',),
}


class OperationInput(serializers.Serializer):
    key = serializers.UUIDField()
    kind = serializers.ChoiceField(choices=tuple(OPERATION_FORMATS))
    count = serializers.IntegerField(min_value=1, max_value=1000)
    format = serializers.CharField(max_length=4)
    file = serializers.FileField(required=False)
    premium = serializers.BooleanField(required=False, default=False)

    def validate(self, attrs):
        kind, format, count = (attrs[field] for field in ('kind', 'format', 'count'))
        if format not in OPERATION_FORMATS[kind] or (format in {'png', 'mp4', 'webm'} and count != 1):
            raise ValidationError('Formato ou quantidade inválida para este recurso.')
        return attrs


def artifact_digest(upload, format, count):
    max_size = (200 if format in {'mp4', 'webm'} else 100) * 1024 * 1024
    if upload.size > max_size:
        raise ValidationError('O arquivo excede o tamanho máximo para confirmar a operação.')
    header = upload.read(16)
    signatures = {'png': b'\x89PNG\r\n\x1a\n', 'pdf': b'%PDF-', 'zip': b'PK\x03\x04', 'webm': b'\x1a\x45\xdf\xa3'}
    if (format == 'mp4' and header[4:8] != b'ftyp') or (format != 'mp4' and not header.startswith(signatures[format])):
        raise ValidationError('O arquivo concluído não corresponde ao formato solicitado.')
    ending = {'png': ARTWORK_ENDINGS['image/png'], 'pdf': b'%%EOF'}
    if format in ending:
        upload.seek(max(0, upload.size - 32))
        if not upload.read().rstrip().endswith(ending[format]):
            raise ValidationError('O arquivo concluído está incompleto.')
    if format == 'pdf':
        upload.seek(0)
        pages = re.search(rb'/Type /Pages /Count (\d{1,4}) /Kids', upload.read(1024))
        if not pages or int(pages[1]) != count:
            raise ValidationError('O PDF não corresponde à quantidade de páginas informada.')
    if format == 'zip':
        try:
            with ZipFile(upload) as archive:
                pages = archive.infolist()
                if len(pages) != count or any(page.is_dir() or not page.filename.endswith('.png') for page in pages):
                    raise ValidationError('O ZIP não corresponde à quantidade de imagens informada.')
        except BadZipFile as error:
            raise ValidationError('O arquivo ZIP está incompleto.') from error
    digest = sha256()
    for chunk in upload.chunks():
        digest.update(chunk)
    return digest.hexdigest()


class CreditOperationView(APIView):
    permission_classes = [IsAuthenticated]

    def post(self, request):
        form = OperationInput(data=request.data)
        form.is_valid(raise_exception=True)
        data = form.validated_data
        kind, count, format = (data[field] for field in ('kind', 'count', 'format'))
        upload = data.get('file')
        hash_value = sha256(f'{kind}:{count}:{format}:{data["premium"]}:{artifact_digest(upload, format, count)}'.encode()).hexdigest() if upload else ''
        for attempt in range(5):
            try:
                return self.apply_operation(request.user, data, hash_value)
            except OperationalError as error:
                if connection.vendor != 'sqlite' or 'locked' not in str(error).lower() or attempt == 4:
                    raise
                sleep(0.015 * (attempt + 1))

    def apply_operation(self, user, data, hash_value):
        from .models import PrintExport, VideoExport

        key, kind, count, format = (data[field] for field in ('key', 'kind', 'count', 'format'))
        upload = data.get('file')
        with billing_account(user) as account:
            movement_key = f'export:{key}'
            existing = CreditMovement.objects.filter(subscription=account, key=movement_key).first()
            if existing:
                if existing.kind != kind or (upload and existing.payload_hash != hash_value):
                    raise ValidationError('Este identificador já foi usado para outra operação.')
                return Response({'credits': account.credits, 'cost': -existing.amount})
            authorize_operation(account.plan_id, kind, count, format)
            charge = plan_costs(account.plan_id)[kind] * count
            if data['premium']:
                require_feature(account.plan_id, 'premium')
            if account.credits < charge:
                raise InsufficientCredits()
            if upload:
                account.credits -= charge
                account.save(update_fields=['credits'])
                CreditMovement.objects.create(subscription=account, key=movement_key, kind=kind,
                    amount=-charge, balance=account.credits, payload_hash=hash_value)
                if kind in {'poster', 'labels'}:
                    PrintExport.objects.get_or_create(user=user, operation=key, defaults={'kind': kind, 'quantity': count})
                elif kind == 'video':
                    VideoExport.objects.get_or_create(user=user, operation=key)
            return Response({'credits': account.credits, 'cost': charge})

