from django.contrib import admin
from rest_framework_simplejwt.token_blacklist.admin import OutstandingTokenAdmin
from rest_framework_simplejwt.token_blacklist.models import OutstandingToken
from .models import Campaign, CreditAdjustment, Plan, Profile, Promotion, StoreBrand, Template

admin.site.site_header = 'Administração da Ofertech'
admin.site.site_title = 'Ofertech'


admin.site.unregister(OutstandingToken)


@admin.register(OutstandingToken)
class SessionMetadataAdmin(OutstandingTokenAdmin):
    fields = ('jti', 'user', 'created_at', 'expires_at')


@admin.register(Plan)
class PlanAdmin(admin.ModelAdmin):
    list_display = ('name', 'code', 'monthly_price', 'monthly_credits')
    readonly_fields = ('code',)

    def has_add_permission(self, request):
        return False

    def has_delete_permission(self, request, obj=None):
        return False


admin.site.register(Profile)
admin.site.register(Template)
admin.site.register(Promotion)


@admin.register(StoreBrand)
class StoreBrandAdmin(admin.ModelAdmin):
    exclude = ('logo',)
    readonly_fields = ('logo_reference',)

    @admin.display(description='Referência do logotipo')
    def logo_reference(self, obj):
        return obj.logo.name if obj else ''


@admin.register(Campaign)
class CampaignAdmin(admin.ModelAdmin):
    exclude = ('thumbnail',)
    readonly_fields = ('thumbnail_reference',)

    @admin.display(description='Referência da miniatura')
    def thumbnail_reference(self, obj):
        return obj.thumbnail.name if obj else ''


@admin.register(CreditAdjustment)
class CreditAdjustmentAdmin(admin.ModelAdmin):
    list_display = ('created_at', 'actor_identifier', 'target_identifier', 'amount', 'balance_after')
    fields = ('created_at', 'actor_identifier', 'target_identifier', 'reason', 'amount', 'balance_before', 'balance_after')
    readonly_fields = fields
    ordering = ('-created_at',)

    def has_view_permission(self, request, obj=None):
        return request.user.is_superuser and request.user.is_staff

    def has_add_permission(self, request):
        return False

    def has_change_permission(self, request, obj=None):
        return False

    def has_delete_permission(self, request, obj=None):
        return False
