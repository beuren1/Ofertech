import base64
import binascii
import math
import re
from decimal import Decimal
from urllib.parse import urlsplit

from rest_framework import serializers, viewsets

from .models import FlyerProject
from .billing import billing_account
from .entitlements import require_feature


class FlyerImageField(serializers.CharField):
    def __init__(self, *, max_length):
        super().__init__(allow_blank=True, max_length=max_length)

    def run_validation(self, data=serializers.empty):
        value = super().run_validation(data)
        if value and not re.fullmatch(r'data:image/(?:jpeg|png|webp);base64,[A-Za-z0-9+/]+={0,2}', value):
            if not value.startswith(('https://', 'http://')):
                raise serializers.ValidationError('Informe uma imagem PNG, JPEG, WebP ou uma URL HTTP(S).')
            serializers.URLField().run_validation(value)
        return value


class FlyerTextPositionSerializer(serializers.Serializer):
    x = serializers.IntegerField(min_value=-100, max_value=100)
    y = serializers.IntegerField(min_value=-100, max_value=100)


class FlyerTextPositionsSerializer(serializers.Serializer):
    name = FlyerTextPositionSerializer(required=False)
    originalPrice = FlyerTextPositionSerializer(required=False)
    offer = FlyerTextPositionSerializer(required=False)


class FlyerDesignPositionsSerializer(serializers.Serializer):
    logo = FlyerTextPositionSerializer(required=False)
    storeName = FlyerTextPositionSerializer(required=False)
    subtitle = FlyerTextPositionSerializer(required=False)
    category = FlyerTextPositionSerializer(required=False)
    backgroundImage = FlyerTextPositionSerializer(required=False)


class ProductGlowSerializer(serializers.Serializer):
    enabled = serializers.BooleanField()
    color = serializers.RegexField(r'^#[0-9a-fA-F]{6}$')
    intensity = serializers.IntegerField(min_value=0, max_value=200)
    blur = serializers.IntegerField(min_value=1, max_value=10)


class FlyerProductSerializer(serializers.Serializer):
    name = serializers.CharField(max_length=180)
    category = serializers.CharField(max_length=80, allow_blank=True)
    price = serializers.CharField(max_length=36, allow_blank=True)
    originalPrice = serializers.CharField(max_length=36, allow_blank=True)
    discount = serializers.CharField(max_length=36, allow_blank=True)
    imageUrl = FlyerImageField(max_length=15000)
    featured = serializers.BooleanField(required=False)
    duration = serializers.IntegerField(min_value=1, max_value=60, required=False)
    photoScale = serializers.IntegerField(min_value=50, max_value=160, required=False)
    photoX = serializers.IntegerField(min_value=-100, max_value=100, required=False)
    photoY = serializers.IntegerField(min_value=-100, max_value=100, required=False)
    detailPhotos = serializers.ListField(child=FlyerImageField(max_length=2400), max_length=3, required=False)
    offerLabel = serializers.ChoiceField(choices=['OFERTA', 'SUPER OFERTA', 'APROVEITE', 'IMPERDÍVEL'], required=False)
    offerColor = serializers.RegexField(r'^#[0-9a-fA-F]{6}$', required=False)
    discountColor = serializers.RegexField(r'^#[0-9a-fA-F]{6}$', required=False)
    offerTextColor = serializers.RegexField(r'^#[0-9a-fA-F]{6}$', required=False)
    discountTextColor = serializers.RegexField(r'^#[0-9a-fA-F]{6}$', required=False)
    oldPriceColor = serializers.RegexField(r'^#[0-9a-fA-F]{6}$', required=False)
    textPositions = FlyerTextPositionsSerializer(required=False)
    lockedLayers = serializers.ListField(
        child=serializers.ChoiceField(choices=['photo', 'name', 'originalPrice', 'offer']),
        max_length=4, required=False,
    )
    glow = ProductGlowSerializer(required=False)


def print_price(value):
    value = re.sub(r'^R\$\s*', '', value)
    if re.fullmatch(r'(?:\d+|\d{1,3}(?:\.\d{3})+),\d{1,2}', value, re.ASCII):
        value = value.replace('.', '').replace(',', '.')
    elif re.fullmatch(r'\d{1,3}(?:\.\d{3})+', value, re.ASCII):
        value = value.replace('.', '')
    elif not re.fullmatch(r'\d+(?:\.\d{1,2})?', value, re.ASCII):
        return None
    price = Decimal(value)
    return price if price * 100 <= 9007199254740991 else None


def valid_print_image(value):
    if not value.startswith('data:'):
        try:
            url = urlsplit(value)
        except ValueError:
            return False
        return url.username is None and url.password is None
    media, content = value.split(',', 1)
    try:
        image = base64.b64decode(content, validate=True)
    except (ValueError, binascii.Error):
        return False
    if media == 'data:image/png;base64':
        return image.startswith(b'\x89PNG\r\n\x1a\n') and image.endswith(b'IEND\xaeB\x60\x82')
    if media == 'data:image/jpeg;base64':
        return image.startswith(b'\xff\xd8\xff') and image.endswith(b'\xff\xd9')
    return image.startswith(b'RIFF') and image[8:12] == b'WEBP'


class PrintSettingsSerializer(serializers.Serializer):
    kind = serializers.ChoiceField(choices=['poster', 'labels'])
    paper = serializers.ChoiceField(choices=['A3', 'A4', 'A5'])
    orientation = serializers.ChoiceField(choices=['portrait', 'landscape'], required=False)
    mode = serializers.ChoiceField(choices=['single', 'bulk'])
    margin = serializers.FloatField(min_value=3, max_value=20)
    labelWidth = serializers.FloatField(min_value=20, max_value=204)
    labelHeight = serializers.FloatField(min_value=15, max_value=291)
    copies = serializers.IntegerField(min_value=1, max_value=10)
    selectedProduct = serializers.IntegerField(min_value=0, max_value=99)
    photoPosition = serializers.ChoiceField(choices=['top', 'left', 'right'])
    textAlign = serializers.ChoiceField(choices=['left', 'center'])

    def validate(self, attrs):
        margin, width, height = (attrs[name] for name in ('margin', 'labelWidth', 'labelHeight'))
        if not all(math.isfinite(value) for value in (margin, width, height)):
            raise serializers.ValidationError('Informe medidas válidas.')
        if attrs['kind'] == 'labels' and (width + 2 * margin > 210 or height + 2 * margin > 297):
            raise serializers.ValidationError('A etiqueta precisa caber na folha A4 com a margem escolhida.')
        return attrs


class VideoSettingsSerializer(serializers.Serializer):
    orientation = serializers.ChoiceField(choices=['horizontal', 'vertical'])
    transition = serializers.ChoiceField(choices=['fade', 'slide', 'zoom'])
    duration = serializers.IntegerField(min_value=1, max_value=60)


class FlyerDesignSerializer(serializers.Serializer):
    title = serializers.CharField(max_length=100)
    subtitle = serializers.CharField(max_length=160, allow_blank=True)
    template = serializers.ChoiceField(choices=['grocery', 'fashion', 'electronics', 'pharmacy', 'flash', 'professional'])
    font = serializers.ChoiceField(choices=['sans', 'serif', 'mono'])
    layout = serializers.IntegerField()
    arrangement = serializers.ChoiceField(choices=['standard', 'wide'])
    grouped = serializers.BooleanField()
    primary = serializers.RegexField(r'^#[0-9a-fA-F]{6}$')
    accent = serializers.RegexField(r'^#[0-9a-fA-F]{6}$')
    background = serializers.RegexField(r'^#[0-9a-fA-F]{6}$')
    logo = FlyerImageField(max_length=66000)
    backgroundImage = FlyerImageField(max_length=132000)
    layerPositions = FlyerDesignPositionsSerializer(required=False)
    lockedLayers = serializers.ListField(
        child=serializers.ChoiceField(choices=['logo', 'storeName', 'subtitle', 'category', 'backgroundImage']),
        max_length=5, required=False,
    )
    headerTextColor = serializers.RegexField(r'^#[0-9a-fA-F]{6}$', required=False)
    storeNameColor = serializers.RegexField(r'^#[0-9a-fA-F]{6}$', required=False)
    subtitleColor = serializers.RegexField(r'^#[0-9a-fA-F]{6}$', required=False)
    logoScale = serializers.IntegerField(min_value=50, max_value=160, required=False)
    categoryTextColor = serializers.RegexField(r'^#[0-9a-fA-F]{6}$', required=False)
    productTextColor = serializers.RegexField(r'^#[0-9a-fA-F]{6}$', required=False)
    storeName = serializers.CharField(max_length=100, allow_blank=True, required=False)
    border = serializers.ChoiceField(choices=['none', 'thin', 'strong'], required=False)
    badge = serializers.ChoiceField(choices=['pill', 'square', 'burst', 'none'], required=False)
    print = PrintSettingsSerializer(required=False)
    video = VideoSettingsSerializer(required=False)

    def validate(self, attrs):
        if 'print' in attrs and 'video' in attrs:
            raise serializers.ValidationError('Escolha um único tipo de projeto.')
        if attrs.get('template') == 'professional' and 'video' in attrs:
            raise serializers.ValidationError('A Oferta Profissional está disponível em encartes e cartazes.')
        return attrs

    def validate_layout(self, value):
        if value not in {4, 6, 9, 12, 16}:
            raise serializers.ValidationError('Selecione 4, 6, 9, 12 ou 16 produtos por página.')
        return value


class FlyerSummarySerializer(serializers.ModelSerializer):
    kind = serializers.SerializerMethodField()

    def get_kind(self, project):
        if 'video' in project.design:
            return 'video'
        if 'print' in project.design:
            return 'print'
        return 'flyer'

    class Meta:
        model = FlyerProject
        fields = ['id', 'name', 'created_at', 'updated_at', 'kind']


class FlyerProjectSerializer(FlyerSummarySerializer):
    design = FlyerDesignSerializer()
    products = FlyerProductSerializer(many=True, max_length=100)

    class Meta(FlyerSummarySerializer.Meta):
        fields = FlyerSummarySerializer.Meta.fields + ['design', 'products']

    def validate_products(self, products):
        if sum(product.get('featured', False) for product in products) > 1:
            raise serializers.ValidationError('Escolha apenas uma oferta principal.')
        return products

    def validate(self, attrs):
        if not {'print', 'video'}.intersection(attrs['design']):
            return attrs
        errors = []
        for product in attrs['products']:
            invalid = {}
            price = print_price(product['price'])
            previous = print_price(product['originalPrice'])
            if product['price'] and price is None:
                invalid['price'] = 'Informe um preço promocional válido.'
            if product['originalPrice'] and previous is None:
                invalid['originalPrice'] = 'Informe um preço anterior válido.'
            if price is not None and previous is not None and price > previous:
                invalid['price'] = 'O preço promocional deve ser menor ou igual ao anterior.'
            if product['imageUrl'] and not valid_print_image(product['imageUrl']):
                invalid['imageUrl'] = 'Informe uma imagem válida ou uma URL sem credenciais.'
            errors.append(invalid)
        if any(errors):
            raise serializers.ValidationError({'products': errors})
        return attrs


class FlyerProjectViewSet(viewsets.ModelViewSet):
    http_method_names = ['get', 'post', 'put', 'head', 'options']

    def get_queryset(self):
        queryset = FlyerProject.objects.filter(owner=self.request.user)
        if self.action == 'list':
            kind = self.request.query_params.get('kind')
            if kind in {'print', 'video'}:
                return queryset.filter(design__has_key=kind)
            if kind != 'all':
                queryset = queryset.exclude(design__has_any_keys=['print', 'video'])
        return queryset

    def get_serializer_class(self):
        return FlyerSummarySerializer if self.action == 'list' else FlyerProjectSerializer

    def perform_create(self, serializer):
        self.check_design_access(serializer.validated_data['design'])
        serializer.save(owner=self.request.user)

    def perform_update(self, serializer):
        self.check_design_access(serializer.validated_data['design'])
        serializer.save()

    def check_design_access(self, design):
        with billing_account(self.request.user) as account:
            if 'video' in design:
                require_feature(account.plan_id, 'video')
            elif 'print' not in design:
                require_feature(account.plan_id, 'flyer')
            elif design['print']['kind'] == 'labels':
                require_feature(account.plan_id, 'labels')
            if design.get('print', {}).get('mode') == 'bulk':
                require_feature(account.plan_id, 'bulk')
            if design['template'] == 'professional':
                require_feature(account.plan_id, 'premium')
