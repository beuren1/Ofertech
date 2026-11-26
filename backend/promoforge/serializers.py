import re

from django.contrib.auth import get_user_model, password_validation
from django.core.exceptions import ValidationError as DjangoValidationError
from rest_framework import serializers
from rest_framework_simplejwt.serializers import TokenObtainPairSerializer
from .models import Campaign, CampaignAsset, Profile, Promotion, StoreBrand, Template

User = get_user_model()

class PromoTokenSerializer(TokenObtainPairSerializer):
    @classmethod
    def get_token(cls, user):
        token = super().get_token(user)
        token['name'] = user.get_full_name() or user.email
        return token

class RegisterSerializer(serializers.Serializer):
    name = serializers.CharField(max_length=150, trim_whitespace=True)
    email = serializers.EmailField(max_length=150)
    password = serializers.CharField(write_only=True, min_length=8, trim_whitespace=False)

    def validate_email(self, value):
        if User.objects.filter(email__iexact=value).exists():
            raise serializers.ValidationError('Já existe uma conta com este e-mail.')
        return value.lower()

    def validate(self, attrs):
        user = User(
            username=attrs['email'],
            email=attrs['email'],
            first_name=attrs['name'].partition(' ')[0],
        )
        try:
            password_validation.validate_password(attrs['password'], user=user)
        except DjangoValidationError as error:
            raise serializers.ValidationError({'password': list(error.messages)}) from error
        return attrs

    def create(self, validated_data):
        name = validated_data.pop('name')
        first_name, _, last_name = name.partition(' ')
        user = User.objects.create_user(
            username=validated_data['email'],
            email=validated_data['email'],
            password=validated_data['password'],
            first_name=first_name,
            last_name=last_name,
        )
        Profile.objects.create(user=user)
        return user

class ProfileSerializer(serializers.ModelSerializer):
    class Meta:
        model = Profile
        fields = ['company', 'phone', 'dark_mode']


class StoreBrandSerializer(serializers.ModelSerializer):
    logo_url = serializers.SerializerMethodField()

    class Meta:
        model = StoreBrand
        fields = [
            'id',
            'name',
            'logo_url',
            'primary_color',
            'secondary_color',
            'instagram',
            'whatsapp',
            'website',
            'slogan',
            'updated_at',
        ]
        read_only_fields = ['id', 'logo_url', 'updated_at']

    def get_logo_url(self, store):
        return f'stores/{store.id}/logo/content/' if store.logo else None

    def validate_name(self, value):
        value = value.strip()
        if not value:
            raise serializers.ValidationError('Informe o nome da loja.')
        return value

    def validate_primary_color(self, value):
        if not re.fullmatch(r'#[0-9a-fA-F]{6}', value):
            raise serializers.ValidationError('Informe uma cor hexadecimal válida.')
        return value.lower()

    def validate_secondary_color(self, value):
        if not re.fullmatch(r'#[0-9a-fA-F]{6}', value):
            raise serializers.ValidationError('Informe uma cor hexadecimal válida.')
        return value.lower()

    def create(self, validated_data):
        validated_data['owner'] = self.context['request'].user
        return super().create(validated_data)


class TemplateSerializer(serializers.ModelSerializer):
    class Meta:
        model = Template
        fields = ['id', 'name', 'category', 'configuration', 'is_public', 'created_at']
        read_only_fields = ['id', 'created_at']

    def create(self, validated_data):
        validated_data['owner'] = self.context['request'].user
        return super().create(validated_data)

class PromotionSerializer(serializers.ModelSerializer):
    class Meta:
        model = Promotion
        fields = ['id', 'template', 'title', 'channel', 'status', 'configuration', 'created_at', 'updated_at']
        read_only_fields = ['id', 'created_at', 'updated_at']

    def validate_template(self, value):
        if value and value.owner_id != self.context['request'].user.pk:
            raise serializers.ValidationError('Este template não pertence à sua conta.')
        return value

    def create(self, validated_data):
        validated_data['owner'] = self.context['request'].user
        return super().create(validated_data)


class CampaignSerializer(serializers.ModelSerializer):
    thumbnail_url = serializers.SerializerMethodField()

    class Meta:
        model = Campaign
        fields = [
            'id',
            'name',
            'batch_id',
            'artworks',
            'store_brand',
            'brand_snapshot',
            'thumbnail_url',
            'created_at',
            'updated_at',
        ]
        read_only_fields = ['id', 'thumbnail_url', 'created_at', 'updated_at']

    def get_thumbnail_url(self, campaign):
        if not campaign.thumbnail:
            return None
        return f'campaigns/{campaign.id}/thumbnail/content/'

    def validate_name(self, value):
        value = value.strip()
        if not value:
            raise serializers.ValidationError('Informe um nome para a campanha.')
        return value

    def validate_artworks(self, value):
        if not isinstance(value, list):
            raise serializers.ValidationError('As artes devem ser enviadas como uma lista.')
        if len(value) > 100:
            raise serializers.ValidationError('Uma campanha pode conter no máximo 100 artes.')

        from .billing import billing_account
        from .entitlements import plan_rules, require_feature

        premium = any(
            isinstance(item, dict) and isinstance(item.get('config'), dict) and item['config'].get('template') == 'professional'
            for item in value
        )
        if len(value) > 1 or premium:
            with billing_account(self.context['request'].user) as account:
                if len(value) > 1:
                    require_feature(account.plan_id, 'bulk')
                    if len(value) > plan_rules(account.plan_id)['batch']:
                        raise serializers.ValidationError('Este lote excede o limite do seu plano.')
                if premium:
                    require_feature(account.plan_id, 'premium')

        asset_ids = set()
        for artwork in value:
            if not isinstance(artwork, dict):
                raise serializers.ValidationError('Cada arte deve ser um objeto válido.')
            product = artwork.get('product')
            if product is not None and not isinstance(product, dict):
                raise serializers.ValidationError('Os dados do produto são inválidos.')
            if isinstance(product, dict):
                asset_id = product.get('image_asset_id')
                if asset_id is not None:
                    if not isinstance(asset_id, int) or isinstance(asset_id, bool):
                        raise serializers.ValidationError('A referência da foto é inválida.')
                    asset_ids.add(asset_id)
            config = artwork.get('config')
            if isinstance(config, dict):
                brand = config.get('brand')
                if isinstance(brand, dict):
                    logo_asset_id = brand.get('logo_asset_id')
                    if logo_asset_id is not None:
                        if not isinstance(logo_asset_id, int) or isinstance(logo_asset_id, bool):
                            raise serializers.ValidationError('A referência da logo é inválida.')
                        asset_ids.add(logo_asset_id)

        campaign = self.instance
        if asset_ids and (
            campaign is None
            or CampaignAsset.objects.filter(
                campaign=campaign,
                owner=self.context['request'].user,
                id__in=asset_ids,
            ).count() != len(asset_ids)
        ):
            raise serializers.ValidationError(
                'Uma ou mais fotos não pertencem a esta campanha.'
            )
        return value

    def validate_store_brand(self, value):
        if value is not None and value.owner_id != self.context['request'].user.id:
            raise serializers.ValidationError('Esta loja não pertence à sua conta.')
        return value

    def validate_brand_snapshot(self, value):
        if not isinstance(value, dict):
            raise serializers.ValidationError('A identidade visual da campanha é inválida.')
        allowed_fields = {
            'name', 'primary_color', 'secondary_color', 'instagram',
            'whatsapp', 'website', 'slogan', 'logo_asset_id',
        }
        snapshot = {key: item for key, item in value.items() if key in allowed_fields}
        for field, max_length in (
            ('name', 150),
            ('instagram', 100),
            ('whatsapp', 30),
            ('website', 200),
            ('slogan', 240),
        ):
            item = snapshot.get(field, '')
            if not isinstance(item, str) or len(item) > max_length:
                raise serializers.ValidationError(
                    {field: 'O valor da identidade visual é inválido.'}
                )
        for field in ('primary_color', 'secondary_color'):
            item = snapshot.get(field, '')
            if item and (
                not isinstance(item, str)
                or not re.fullmatch(r'#[0-9a-fA-F]{6}', item)
            ):
                raise serializers.ValidationError(
                    {field: 'Informe uma cor hexadecimal válida.'}
                )

        logo_asset_id = snapshot.get('logo_asset_id')
        if logo_asset_id is not None:
            campaign = self.instance
            if (
                not isinstance(logo_asset_id, int)
                or isinstance(logo_asset_id, bool)
                or campaign is None
                or not CampaignAsset.objects.filter(
                    campaign=campaign,
                    owner=self.context['request'].user,
                    id=logo_asset_id,
                ).exists()
            ):
                raise serializers.ValidationError({
                    'logo_asset_id': 'A logo precisa ser um arquivo desta campanha.'
                })
        return snapshot

    def create(self, validated_data):
        validated_data['owner'] = self.context['request'].user
        return super().create(validated_data)

    def update(self, instance, validated_data):
        artworks = validated_data.get('artworks', instance.artworks)
        brand_snapshot = validated_data.get('brand_snapshot', instance.brand_snapshot)
        saved = super().update(instance, validated_data)
        retained_ids = {
            artwork['product']['image_asset_id']
            for artwork in artworks
            if isinstance(artwork, dict)
            and isinstance(artwork.get('product'), dict)
            and isinstance(artwork['product'].get('image_asset_id'), int)
        }
        retained_ids.update(
            artwork['config']['brand']['logo_asset_id']
            for artwork in artworks
            if isinstance(artwork, dict)
            and isinstance(artwork.get('config'), dict)
            and isinstance(artwork['config'].get('brand'), dict)
            and isinstance(artwork['config']['brand'].get('logo_asset_id'), int)
        )
        brand_logo_id = brand_snapshot.get('logo_asset_id')
        if isinstance(brand_logo_id, int) and not isinstance(brand_logo_id, bool):
            retained_ids.add(brand_logo_id)
        unused_assets = saved.assets.exclude(id__in=retained_ids)
        for asset in unused_assets:
            asset.file.delete(save=False)
        unused_assets.delete()
        return saved
