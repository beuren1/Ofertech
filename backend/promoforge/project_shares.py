import re
from secrets import token_urlsafe

from django.shortcuts import get_object_or_404
from django.utils import timezone
from rest_framework import serializers, status
from rest_framework.permissions import AllowAny, IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from .models import FlyerProject, ProjectShare

PRIVATE_HEADERS = {'Cache-Control': 'private, no-store'}


class ShareInput(serializers.Serializer):
    label = serializers.CharField(max_length=80)


class ShareOutput(serializers.ModelSerializer):
    class Meta:
        model = ProjectShare
        fields = ['id', 'label', 'token']


def project_share_kind(project):
    if 'menu' in project.design:
        return 'menu'
    if project.design.get('tv') and 'video' in project.design:
        return 'tv'
    return None


class ProjectSharesView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request, project_id):
        project = get_object_or_404(FlyerProject, pk=project_id, owner=request.user)
        shares = project.shares.filter(revoked_at__isnull=True)
        return Response(ShareOutput(shares, many=True).data, headers=PRIVATE_HEADERS)

    def post(self, request, project_id):
        project = get_object_or_404(FlyerProject, pk=project_id, owner=request.user)
        if project_share_kind(project) is None:
            return Response({'detail': 'Este projeto não pode ser publicado.'}, status=400)
        if not project.products:
            return Response({'detail': 'Adicione pelo menos um item antes de publicar.'}, status=400)
        form = ShareInput(data=request.data)
        form.is_valid(raise_exception=True)
        share = ProjectShare.objects.create(project=project, token=token_urlsafe(32), **form.validated_data)
        return Response(ShareOutput(share).data, status=status.HTTP_201_CREATED, headers=PRIVATE_HEADERS)


class RevokeProjectShareView(APIView):
    permission_classes = [IsAuthenticated]

    def delete(self, request, project_id, share_id):
        share = get_object_or_404(ProjectShare, pk=share_id, project_id=project_id, project__owner=request.user)
        if share.revoked_at is None:
            share.revoked_at = timezone.now()
            share.save(update_fields=['revoked_at'])
        return Response(status=status.HTTP_204_NO_CONTENT)


class PublicProjectView(APIView):
    authentication_classes = []
    permission_classes = [AllowAny]

    def get(self, request, token):
        if not re.fullmatch(r'[A-Za-z0-9_-]{43}', token):
            return self.response({'detail': 'Link indisponível.'}, 404)
        share = ProjectShare.objects.select_related('project').filter(token=token, revoked_at__isnull=True).first()
        if not share or not (kind := project_share_kind(share.project)):
            return self.response({'detail': 'Link indisponível.'}, 404)
        project = share.project
        revision = project.updated_at.isoformat()
        if request.query_params.get('revision') == revision:
            return self.response(None, 204)
        design_fields = {'title', 'subtitle', 'storeName', 'logo', 'backgroundImage', 'primary', 'accent', 'background',
                         'font', 'template', 'border', 'badge', 'menu', 'headerTextColor', 'productTextColor',
                         'storeNameColor', 'subtitleColor', 'logoScale', 'categoryTextColor', 'video'}
        product_fields = {'name', 'category', 'description', 'price', 'originalPrice', 'discount', 'imageUrl', 'featured'}
        if kind == 'tv':
            product_fields.update({'duration', 'slideImageUrl', 'photoX', 'photoY', 'photoScale', 'glow',
                                   'detailPhotos', 'offerColor', 'offerTextColor', 'discountColor',
                                   'discountTextColor', 'oldPriceColor', 'offerLabel'})
        return self.response({
            'kind': kind, 'name': project.name, 'revision': revision,
            'design': {key: value for key, value in project.design.items() if key in design_fields},
            'products': [{key: value for key, value in product.items() if key in product_fields} for product in project.products],
        })

    @staticmethod
    def response(data, status_code=200):
        return Response(data, status=status_code, headers={
            'Cache-Control': 'no-store', 'X-Robots-Tag': 'noindex', 'Referrer-Policy': 'no-referrer',
        })
