from pathlib import Path
from uuid import uuid4

from django.conf import settings
from django.db import models


def campaign_thumbnail_path(instance, filename):
    extension = Path(filename).suffix.lower()
    return f'campaigns/{instance.owner_id}/{uuid4().hex}{extension}'


def campaign_asset_path(instance, filename):
    extension = Path(filename).suffix.lower()
    return f'campaigns/{instance.campaign_id}/assets/{uuid4().hex}{extension}'


def store_logo_path(instance, filename):
    extension = Path(filename).suffix.lower()
    return f'store-brands/{instance.owner_id}/{uuid4().hex}{extension}'


class Profile(models.Model):
    user = models.OneToOneField(settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name='profile')
    company = models.CharField(max_length=150, blank=True)
    phone = models.CharField(max_length=30, blank=True)
    dark_mode = models.BooleanField(default=False)
    created_at = models.DateTimeField(auto_now_add=True)

    def __str__(self):
        return f'{self.user.username} Profile'


class StoreBrand(models.Model):
    owner = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name='store_brands',
    )
    name = models.CharField(max_length=150)
    logo = models.FileField(upload_to=store_logo_path, blank=True)
    primary_color = models.CharField(max_length=7, default='#4f46e5')
    secondary_color = models.CharField(max_length=7, default='#f97316')
    instagram = models.CharField(max_length=100, blank=True)
    whatsapp = models.CharField(max_length=30, blank=True)
    website = models.URLField(max_length=200, blank=True)
    slogan = models.CharField(max_length=240, blank=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ['name', 'id']

    def __str__(self):
        return self.name


class Template(models.Model):
    owner = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name='templates')
    name = models.CharField(max_length=120)
    category = models.CharField(max_length=80)
    configuration = models.JSONField(default=dict, blank=True)
    is_public = models.BooleanField(default=False)
    created_at = models.DateTimeField(auto_now_add=True)

    def __str__(self):
        return self.name


class Campaign(models.Model):
    owner = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name='campaigns',
    )
    name = models.CharField(max_length=180)
    batch_id = models.CharField(max_length=100, blank=True)
    artworks = models.JSONField(default=list, blank=True)
    store_brand = models.ForeignKey(
        StoreBrand,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='campaigns',
    )
    brand_snapshot = models.JSONField(default=dict, blank=True)
    thumbnail = models.FileField(
        upload_to=campaign_thumbnail_path,
        blank=True,
    )
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ['-updated_at', '-created_at']

    def __str__(self):
        return self.name


class FlyerProject(models.Model):
    owner = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name='flyer_projects')
    name = models.CharField(max_length=180)
    design = models.JSONField()
    products = models.JSONField(default=list)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ['-updated_at', '-id']


class UserActiveDay(models.Model):
    user = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE)
    day = models.DateField(db_index=True)

    class Meta:
        constraints = [models.UniqueConstraint(fields=['user', 'day'], name='unique_user_active_day')]


class VideoExport(models.Model):
    user = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE)
    operation = models.UUIDField()
    created_at = models.DateTimeField(auto_now_add=True, db_index=True)

    class Meta:
        constraints = [models.UniqueConstraint(fields=['user', 'operation'], name='unique_user_video_export')]


class PrintExport(models.Model):
    user = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE)
    operation = models.UUIDField()
    kind = models.CharField(max_length=8)
    quantity = models.PositiveIntegerField()
    created_at = models.DateTimeField(auto_now_add=True, db_index=True)

    class Meta:
        constraints = [models.UniqueConstraint(fields=['user', 'operation'], name='unique_user_print_export')]


class CreditAdjustment(models.Model):
    movement = models.OneToOneField('CreditMovement', null=True, on_delete=models.SET_NULL)
    actor_identifier = models.PositiveBigIntegerField()
    target_identifier = models.PositiveBigIntegerField(db_index=True)
    reason = models.CharField(max_length=500)
    amount = models.IntegerField()
    balance_before = models.PositiveIntegerField()
    balance_after = models.PositiveIntegerField()
    created_at = models.DateTimeField(auto_now_add=True)


class AuthRateWindow(models.Model):
    key = models.CharField(max_length=64, primary_key=True)
    count = models.PositiveIntegerField(default=0)
    reported = models.BooleanField(default=False)
    expires_at = models.DateTimeField(db_index=True)


class PasswordResetDelivery(models.Model):
    email = models.EmailField(max_length=254)
    created_at = models.DateTimeField(auto_now_add=True, db_index=True)
    available_at = models.DateTimeField(db_index=True)
    attempts = models.PositiveSmallIntegerField(default=0)
    lease = models.UUIDField(null=True)


class CampaignAsset(models.Model):
    campaign = models.ForeignKey(
        Campaign,
        on_delete=models.CASCADE,
        related_name='assets',
    )
    owner = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name='campaign_assets',
    )
    file = models.FileField(upload_to=campaign_asset_path)
    original_name = models.CharField(max_length=255)
    content_type = models.CharField(max_length=50)
    created_at = models.DateTimeField(auto_now_add=True)

    def __str__(self):
        return self.original_name


class Promotion(models.Model):
    class Status(models.TextChoices):
        DRAFT = 'draft', 'Rascunho'
        PROCESSING = 'processing', 'Processando'
        READY = 'ready', 'Pronta'

    owner = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name='promotions')
    campaign = models.ForeignKey(
        Campaign,
        on_delete=models.CASCADE,
        null=True,
        blank=True,
        related_name='promotions',
    )
    template = models.ForeignKey(Template, on_delete=models.SET_NULL, null=True, blank=True)
    title = models.CharField(max_length=180)
    channel = models.CharField(max_length=50, default='Instagram')
    status = models.CharField(max_length=20, choices=Status.choices, default=Status.DRAFT)
    configuration = models.JSONField(default=dict, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ['-created_at']

    def __str__(self):
        return self.title

from .billing_models import CreditMovement, Plan, PlanChange, Subscription
