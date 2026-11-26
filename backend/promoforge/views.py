from copy import deepcopy
from pathlib import Path
from uuid import uuid4

from rest_framework import permissions, viewsets
from django.conf import settings
from django.core.files.base import ContentFile
from django.db import transaction
from django.db.models import F
from django.http import FileResponse, Http404
from django.shortcuts import get_object_or_404
from django.utils.decorators import method_decorator
from django.views.decorators.cache import never_cache
from rest_framework.filters import OrderingFilter
from rest_framework.decorators import action
from rest_framework.exceptions import AuthenticationFailed, PermissionDenied, ValidationError
from rest_framework.parsers import JSONParser
from rest_framework.response import Response
from rest_framework.views import APIView
from rest_framework import status
from rest_framework_simplejwt.exceptions import TokenError
from rest_framework_simplejwt.views import TokenObtainPairView
from .billing import billing_account
from .entitlements import plan_rules, require_feature
from .models import AuthRateWindow, Campaign, CampaignAsset, Profile, Promotion, StoreBrand, Template, UserActiveDay
from .auth_security import (
    LOGIN_ACCOUNT_LIMIT, LOGIN_IP_LIMIT, RESET_CONFIRM_ACCOUNT_LIMIT, RESET_CONFIRM_IP_LIMIT, RESET_MESSAGE,
    PasswordBoundRefreshSerializer, ResetConfirmInput, ResetRequestInput, apply_password_reset, check_auth_origin,
    client_ip, login_username, parse_uid, queue_reset, take_or_throttle,
)
from django.utils import timezone
from .serializers import (
    CampaignSerializer,
    ProfileSerializer,
    PromotionSerializer,
    PromoTokenSerializer,
    RegisterSerializer,
    StoreBrandSerializer,
    TemplateSerializer,
)

REFRESH_COOKIE_NAME = 'promoforge_refresh'
REFRESH_COOKIE_PATH = '/api/auth/'
IMAGE_TYPES = {
    '.png': 'image/png',
    '.jpg': 'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.webp': 'image/webp',
}


def validate_image_upload(upload, verify_signature=False):
    extension = Path(upload.name).suffix.lower()
    expected_type = IMAGE_TYPES.get(extension)
    if not expected_type or upload.content_type != expected_type:
        raise ValidationError({
            'file': 'Envie uma imagem PNG, JPG ou WebP válida.'
        })
    if upload.size <= 0 or upload.size > 10 * 1024 * 1024:
        raise ValidationError({'file': 'A imagem deve ter entre 1 byte e 10 MB.'})
    if verify_signature:
        header = upload.read(12)
        upload.seek(0)
        valid_signature = (
            expected_type == 'image/png' and header.startswith(b'\x89PNG\r\n\x1a\n')
            or expected_type == 'image/jpeg' and header.startswith(b'\xff\xd8\xff')
            or expected_type == 'image/webp'
            and header[:4] == b'RIFF'
            and header[8:12] == b'WEBP'
        )
        if not valid_signature:
            raise ValidationError({'file': 'O conteúdo não corresponde a uma imagem válida.'})
    return expected_type


def protected_file_response(upload, content_type):
    try:
        content = upload.open('rb')
    except FileNotFoundError:
        raise Http404 from None
    response = FileResponse(content, content_type=content_type)
    response['X-Content-Type-Options'] = 'nosniff'
    response['Cache-Control'] = 'private, no-store'
    return response


def set_refresh_cookie(response, refresh_token):
    response.set_cookie(
        REFRESH_COOKIE_NAME,
        str(refresh_token),
        max_age=int(settings.SIMPLE_JWT['REFRESH_TOKEN_LIFETIME'].total_seconds()),
        httponly=True,
        secure=settings.SESSION_COOKIE_SECURE,
        samesite='Lax',
        path=REFRESH_COOKIE_PATH,
    )
    return response


def clear_refresh_cookie(response):
    response.delete_cookie(
        REFRESH_COOKIE_NAME,
        path=REFRESH_COOKIE_PATH,
        samesite='Lax',
    )
    return response


@method_decorator(never_cache, name='dispatch')
class LoginView(TokenObtainPairView):
    serializer_class = PromoTokenSerializer

    permission_classes = [permissions.AllowAny]
    parser_classes = [JSONParser]

    def post(self, request, *args, **kwargs):
        check_auth_origin(request)
        take_or_throttle('login-ip', client_ip(request), LOGIN_IP_LIMIT)
        data = request.data
        supplied = data.get('username') if isinstance(data, dict) else None
        identifier = ''
        if isinstance(supplied, str) and len(supplied) <= 254:
            username = login_username(supplied.strip())
            identifier = username.casefold()
            data = {**data, 'username': username}
        key = take_or_throttle('login-account', identifier, LOGIN_ACCOUNT_LIMIT) if identifier else None
        serializer = self.get_serializer(data=data)
        try:
            serializer.is_valid(raise_exception=True)
        except AuthenticationFailed:
            raise AuthenticationFailed('E-mail ou senha inválidos.') from None
        if key:
            AuthRateWindow.objects.filter(pk=key, count__gt=0).update(count=F('count') - 1)
        response = Response({'access': serializer.validated_data['access']})
        return set_refresh_cookie(response, serializer.validated_data['refresh'])


@method_decorator(never_cache, name='dispatch')
class RegisterView(APIView):
    permission_classes = [permissions.AllowAny]
    parser_classes = [JSONParser]

    def post(self, request):
        check_auth_origin(request)
        serializer = RegisterSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        with transaction.atomic():
            user = serializer.save()
            with billing_account(user):
                pass
        refresh = PromoTokenSerializer.get_token(user)
        response = Response(
            {
                'id': user.id,
                'username': user.username,
                'email': user.email,
                'access': str(refresh.access_token),
            },
            status=status.HTTP_201_CREATED,
        )
        return set_refresh_cookie(response, refresh)


@method_decorator(never_cache, name='dispatch')
class RefreshView(APIView):
    permission_classes = [permissions.AllowAny]

    def post(self, request):
        check_auth_origin(request)
        refresh_token = request.COOKIES.get(REFRESH_COOKIE_NAME)
        if not refresh_token:
            return Response(
                {'detail': 'Sessão não encontrada.'},
                status=status.HTTP_401_UNAUTHORIZED,
            )

        serializer = PasswordBoundRefreshSerializer(data={'refresh': refresh_token})
        try:
            serializer.is_valid(raise_exception=True)
        except (TokenError, AuthenticationFailed):
            return clear_refresh_cookie(Response(
                {'detail': 'Sessão inválida ou expirada.'},
                status=status.HTTP_401_UNAUTHORIZED,
            ))
        response = Response({'access': serializer.validated_data['access']})
        rotated_refresh = serializer.validated_data.get('refresh')
        if rotated_refresh:
            set_refresh_cookie(response, rotated_refresh)
        return response


@method_decorator(never_cache, name='dispatch')
class LogoutView(APIView):
    permission_classes = [permissions.AllowAny]

    def post(self, request):
        check_auth_origin(request)
        refresh_token = request.COOKIES.get(REFRESH_COOKIE_NAME)
        if refresh_token:
            try:
                from rest_framework_simplejwt.tokens import RefreshToken

                RefreshToken(refresh_token).blacklist()
            except TokenError:
                pass
        return clear_refresh_cookie(
            Response(status=status.HTTP_205_RESET_CONTENT),
        )


@method_decorator(never_cache, name='dispatch')
class PasswordResetRequestView(APIView):
    authentication_classes = []
    permission_classes = [permissions.AllowAny]
    parser_classes = [JSONParser]

    def post(self, request):
        check_auth_origin(request)
        form = ResetRequestInput(data=request.data)
        form.is_valid(raise_exception=True)
        queue_reset(request, form.validated_data['email'])
        return Response({'detail': RESET_MESSAGE}, status=status.HTTP_202_ACCEPTED)


@method_decorator(never_cache, name='dispatch')
class PasswordResetConfirmView(APIView):
    authentication_classes = []
    permission_classes = [permissions.AllowAny]
    parser_classes = [JSONParser]

    def post(self, request):
        check_auth_origin(request)
        address = client_ip(request)
        take_or_throttle('reset-confirm-ip', address, RESET_CONFIRM_IP_LIMIT)
        form = ResetConfirmInput(data=request.data)
        form.is_valid(raise_exception=True)
        uid = parse_uid(form.validated_data['uid'])
        if uid:
            take_or_throttle('reset-confirm-pair', f'{uid}:{address}', RESET_CONFIRM_ACCOUNT_LIMIT)
        apply_password_reset(uid, form.validated_data['token'], form.validated_data['password'])
        return clear_refresh_cookie(Response({'detail': 'Senha redefinida. Entre novamente com a nova senha.'}))


@method_decorator(never_cache, name='dispatch')
class MeView(APIView):
    def get(self, request):
        profile, _ = Profile.objects.get_or_create(user=request.user)
        profile_data = ProfileSerializer(profile).data
        with billing_account(request.user) as account:
            profile_data.update(plan=account.plan_id, plan_name=account.plan.name)
        UserActiveDay.objects.get_or_create(user=request.user, day=timezone.localdate())
        return Response({
            'id': request.user.id,
            'username': request.user.username,
            'email': request.user.email,
            'name': request.user.get_full_name() or request.user.email,
            'commercial_admin': request.user.is_staff and request.user.is_superuser,
            'profile': profile_data,
        })

class TemplateViewSet(viewsets.ModelViewSet):
    serializer_class = TemplateSerializer

    def get_queryset(self):
        return Template.objects.filter(owner=self.request.user)

    def perform_create(self, serializer):
        with billing_account(self.request.user) as account:
            require_feature(account.plan_id, 'custom_templates')
            serializer.save()

    def perform_update(self, serializer):
        with billing_account(self.request.user) as account:
            require_feature(account.plan_id, 'custom_templates')
            serializer.save()

class PromotionViewSet(viewsets.ModelViewSet):
    serializer_class = PromotionSerializer

    def get_queryset(self):
        return Promotion.objects.filter(owner=self.request.user)

    @action(detail=False, methods=['get', 'post', 'patch'])
    def bulk(self, request):
        if request.method == 'GET':
            batch_id = request.query_params.get('batch_id')
            if not batch_id:
                raise ValidationError({'batch_id': 'Informe o identificador do lote.'})
            saved = self.get_queryset().filter(
                configuration__batch_id=batch_id,
            ).order_by('id')
            return Response({
                'created': saved.count(),
                'promotions': PromotionSerializer(saved, many=True).data,
            })

        if request.method == 'PATCH':
            with billing_account(request.user) as account:
                require_feature(account.plan_id, 'bulk')
            updates = request.data.get('promotions')
            if not isinstance(updates, list) or not updates:
                raise ValidationError({
                    'promotions': 'Envie as edições das promoções do lote.',
                })
            ids = [item.get('id') if isinstance(item, dict) else None for item in updates]
            if any(not isinstance(value, int) or isinstance(value, bool) for value in ids):
                raise ValidationError({'promotions': 'Cada edição deve conter um ID válido.'})
            if len(set(ids)) != len(ids):
                raise ValidationError({'promotions': 'IDs duplicados no lote.'})

            saved = list(self.get_queryset().filter(id__in=ids))
            if len(saved) != len(ids):
                raise ValidationError({'promotions': 'Uma ou mais promoções não existem.'})
            saved_by_id = {promotion.id: promotion for promotion in saved}
            with transaction.atomic():
                for item in updates:
                    promotion = saved_by_id[item['id']]
                    serializer = PromotionSerializer(
                        promotion,
                        data={
                            'title': item.get('title', promotion.title),
                            'configuration': item.get(
                                'configuration',
                                promotion.configuration,
                            ),
                        },
                        partial=True,
                        context=self.get_serializer_context(),
                    )
                    serializer.is_valid(raise_exception=True)
                    serializer.save()
            return Response({
                'created': len(saved),
                'promotions': PromotionSerializer(saved, many=True).data,
            })

        promotions = request.data.get('promotions')
        if not isinstance(promotions, list) or not promotions:
            raise ValidationError({
                'promotions': 'Envie uma lista com ao menos uma promoção.',
            })
        if len(promotions) > 100:
            raise ValidationError({
                'promotions': 'O limite por lote é de 100 promoções.',
            })

        with billing_account(request.user) as account:
            require_feature(account.plan_id, 'bulk')
            if len(promotions) > plan_rules(account.plan_id)['batch']:
                raise ValidationError('Este lote excede o limite do seu plano.')

        serializer = PromotionSerializer(
            data=promotions,
            many=True,
            context=self.get_serializer_context(),
        )
        serializer.is_valid(raise_exception=True)
        campaign_id = request.data.get('campaign_id')
        campaign = None
        if campaign_id is not None:
            campaign = get_object_or_404(
                Campaign.objects.filter(owner=request.user),
                id=campaign_id,
            )
        with transaction.atomic():
            saved = serializer.save(campaign=campaign)
        return Response(
            {
                'created': len(saved),
                'promotions': PromotionSerializer(saved, many=True).data,
            },
            status=201,
        )

    @action(detail=False, methods=['get'])
    def summary(self, request):
        qs = self.get_queryset()
        return Response({
            'total': qs.count(),
            'ready': qs.filter(status=Promotion.Status.READY).count(),
            'draft': qs.filter(status=Promotion.Status.DRAFT).count(),
        })


class StoreBrandViewSet(viewsets.ModelViewSet):
    serializer_class = StoreBrandSerializer

    def get_queryset(self):
        return StoreBrand.objects.filter(owner=self.request.user)

    def perform_create(self, serializer):
        with billing_account(self.request.user) as account:
            limit = plan_rules(account.plan_id)['stores']
            if self.get_queryset().count() >= limit:
                raise ValidationError(f'Seu plano permite até {limit} identidades visuais. Consulte Planos e créditos.')
            serializer.save()

    def perform_destroy(self, instance):
        if instance.logo:
            instance.logo.delete(save=False)
        super().perform_destroy(instance)

    @action(detail=True, methods=['post'], url_path='logo-upload')
    def logo_upload(self, request, pk=None):
        store = self.get_object()
        upload = request.FILES.get('file')
        if upload is None:
            raise ValidationError({'file': 'Selecione uma logo para enviar.'})
        validate_image_upload(upload, verify_signature=True)
        old_logo_name = store.logo.name
        store.logo.save(
            Path(upload.name).name[:255],
            upload,
            save=True,
        )
        if old_logo_name:
            store.logo.storage.delete(old_logo_name)
        return Response(StoreBrandSerializer(
            store,
            context=self.get_serializer_context(),
        ).data)

    @action(detail=True, methods=['delete'], url_path='logo')
    def remove_logo(self, request, pk=None):
        store = self.get_object()
        if store.logo:
            store.logo.delete(save=False)
            store.logo = ''
            store.save(update_fields=['logo', 'updated_at'])
        return Response(status=status.HTTP_204_NO_CONTENT)


class CampaignViewSet(viewsets.ModelViewSet):
    serializer_class = CampaignSerializer
    filter_backends = [OrderingFilter]
    ordering_fields = ['created_at', 'updated_at']
    ordering = ['-updated_at', '-created_at']

    def get_queryset(self):
        queryset = Campaign.objects.filter(owner=self.request.user).prefetch_related('assets')
        batch_id = self.request.query_params.get('batch_id')
        if batch_id:
            queryset = queryset.filter(batch_id=batch_id)
        store_id = self.request.query_params.get('store_brand')
        if store_id is not None:
            with billing_account(self.request.user) as account:
                if account.plan_id != 'business':
                    raise PermissionDenied('Organizar campanhas por loja exige o plano Business.')
            if store_id == 'none':
                return queryset.filter(store_brand__isnull=True)
            if not store_id.isascii() or not store_id.isdecimal() or len(store_id) > 18:
                raise ValidationError('Loja inválida.')
            queryset = queryset.filter(store_brand_id=int(store_id), store_brand__owner=self.request.user)
        return queryset

    def perform_destroy(self, instance):
        for asset in instance.assets.all():
            asset.file.delete(save=False)
        if instance.thumbnail:
            instance.thumbnail.delete(save=False)
        super().perform_destroy(instance)

    @action(detail=True, methods=['post'], url_path='assets')
    def assets(self, request, pk=None):
        campaign = self.get_object()
        upload = request.FILES.get('file')
        if upload is None:
            raise ValidationError({'file': 'Selecione uma imagem para enviar.'})
        content_type = validate_image_upload(upload, verify_signature=True)
        asset = CampaignAsset.objects.create(
            campaign=campaign,
            owner=request.user,
            file=upload,
            original_name=Path(upload.name).name[:255],
            content_type=content_type,
        )
        return Response({
            'id': asset.id,
            'url': f'campaigns/{campaign.id}/assets/{asset.id}/content/',
            'original_name': asset.original_name,
        }, status=status.HTTP_201_CREATED)

    @action(detail=True, methods=['post'], url_path='thumbnail-upload')
    def thumbnail_upload(self, request, pk=None):
        campaign = self.get_object()
        upload = request.FILES.get('file')
        if upload is None:
            raise ValidationError({'file': 'Selecione uma miniatura para enviar.'})
        validate_image_upload(upload, verify_signature=True)
        if campaign.thumbnail:
            campaign.thumbnail.delete(save=False)
        campaign.thumbnail.save(
            Path(upload.name).name[:255],
            upload,
            save=False,
        )
        campaign.save(update_fields=['thumbnail', 'updated_at'])
        return Response(CampaignSerializer(campaign, context=self.get_serializer_context()).data)

    @action(detail=True, methods=['post'])
    def duplicate(self, request, pk=None):
        source = self.get_object()
        requested_name = request.data.get('name')
        if requested_name is not None and not isinstance(requested_name, str):
            raise ValidationError({'name': 'O nome da cópia deve ser um texto.'})
        name = (requested_name or f'{source.name} (cópia)').strip()
        if not name or len(name) > 180:
            raise ValidationError({'name': 'Informe um nome com até 180 caracteres.'})

        duplicate_batch_id = str(uuid4())
        with transaction.atomic():
            duplicate = Campaign.objects.create(
                owner=request.user,
                name=name,
                batch_id=duplicate_batch_id,
                store_brand=source.store_brand,
                brand_snapshot=deepcopy(source.brand_snapshot),
            )
            asset_ids = {}
            for asset in source.assets.all():
                with asset.file.open('rb') as source_file:
                    cloned_asset = CampaignAsset.objects.create(
                        campaign=duplicate,
                        owner=request.user,
                        original_name=asset.original_name,
                        content_type=asset.content_type,
                    )
                    cloned_asset.file.save(
                        asset.original_name,
                        ContentFile(source_file.read()),
                        save=True,
                    )
                    asset_ids[asset.id] = cloned_asset.id

            if source.thumbnail:
                with source.thumbnail.open('rb') as source_thumbnail:
                    duplicate.thumbnail.save(
                        Path(source.thumbnail.name).name,
                        ContentFile(source_thumbnail.read()),
                        save=False,
                    )

            cloned_promotions = {}
            for promotion in source.promotions.all():
                configuration = deepcopy(promotion.configuration)
                configuration['batch_id'] = duplicate_batch_id
                old_asset_id = configuration.get('image_asset_id')
                if old_asset_id in asset_ids:
                    configuration['image_asset_id'] = asset_ids[old_asset_id]
                clone = Promotion.objects.create(
                    owner=request.user,
                    campaign=duplicate,
                    template=promotion.template,
                    title=promotion.title,
                    channel=promotion.channel,
                    status=promotion.status,
                    configuration=configuration,
                )
                cloned_promotions[promotion.id] = clone.id

            artworks = deepcopy(source.artworks)
            for artwork in artworks:
                if not isinstance(artwork, dict):
                    continue
                product = artwork.get('product')
                if isinstance(product, dict):
                    old_asset_id = product.get('image_asset_id')
                    if old_asset_id in asset_ids:
                        product['image_asset_id'] = asset_ids[old_asset_id]
                config = artwork.get('config')
                if isinstance(config, dict):
                    brand = config.get('brand')
                    if isinstance(brand, dict):
                        old_brand_logo_id = brand.get('logo_asset_id')
                        if old_brand_logo_id in asset_ids:
                            brand['logo_asset_id'] = asset_ids[old_brand_logo_id]
                old_promotion_id = artwork.get('promotion_id')
                if old_promotion_id in cloned_promotions:
                    artwork['promotion_id'] = cloned_promotions[old_promotion_id]
            old_snapshot_logo_id = duplicate.brand_snapshot.get('logo_asset_id')
            if old_snapshot_logo_id in asset_ids:
                duplicate.brand_snapshot['logo_asset_id'] = asset_ids[old_snapshot_logo_id]
            duplicate.artworks = artworks
            duplicate.save(update_fields=['artworks', 'brand_snapshot', 'updated_at'])

        return Response(
            CampaignSerializer(duplicate, context=self.get_serializer_context()).data,
            status=status.HTTP_201_CREATED,
        )


class CampaignAssetContentView(APIView):
    def get(self, request, campaign_id, asset_id):
        campaign = get_object_or_404(Campaign, id=campaign_id, owner=request.user)
        asset = get_object_or_404(
            CampaignAsset,
            id=asset_id,
            campaign=campaign,
            owner=request.user,
        )
        return protected_file_response(asset.file, asset.content_type)


class CampaignThumbnailContentView(APIView):
    def get(self, request, campaign_id):
        campaign = get_object_or_404(Campaign, id=campaign_id, owner=request.user)
        if not campaign.thumbnail:
            raise Http404
        content_type = IMAGE_TYPES.get(Path(campaign.thumbnail.name).suffix.lower())
        if not content_type:
            raise ValidationError({'thumbnail': 'A miniatura armazenada é inválida.'})
        return protected_file_response(campaign.thumbnail, content_type)


class StoreBrandLogoContentView(APIView):
    def get(self, request, store_id):
        store = get_object_or_404(
            StoreBrand.objects.filter(owner=request.user),
            id=store_id,
        )
        if not store.logo:
            raise Http404
        content_type = IMAGE_TYPES.get(Path(store.logo.name).suffix.lower())
        if not content_type:
            raise ValidationError({'logo': 'A logo armazenada é inválida.'})
        return protected_file_response(store.logo, content_type)
