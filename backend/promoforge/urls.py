from django.urls import path
from rest_framework.routers import DefaultRouter
from .flyers import FlyerProjectViewSet
from .commercial import (
    CommercialAdjustView, CommercialHistoryView, CommercialOverviewView, CommercialPaymentsView,
    CommercialReportView, CommercialSubscriptionsView, CommercialUsersView, PrintExportView, VideoExportView,
)
from .views import (
    LoginView,
    LogoutView,
    CampaignAssetContentView,
    CampaignThumbnailContentView,
    CampaignViewSet,
    MeView,
    PasswordResetConfirmView,
    PasswordResetRequestView,
    PromotionViewSet,
    RefreshView,
    RegisterView,
    StoreBrandLogoContentView,
    StoreBrandViewSet,
    TemplateViewSet,
)

router = DefaultRouter()
router.register('campaigns', CampaignViewSet, basename='campaign')
router.register('flyers', FlyerProjectViewSet, basename='flyer')
router.register('stores', StoreBrandViewSet, basename='store')
router.register('templates', TemplateViewSet, basename='template')
router.register('promotions', PromotionViewSet, basename='promotion')

from .billing import ArtworkCreditsView, BillingView, CreditOperationView, MercadoPagoWebhookView, PlanChangeView, PlansView

urlpatterns = [
    path('admin-dashboard/overview/', CommercialOverviewView.as_view()),
    path('admin-dashboard/users/', CommercialUsersView.as_view()),
    path('admin-dashboard/users/<int:user_id>/history/', CommercialHistoryView.as_view()),
    path('admin-dashboard/users/<int:user_id>/adjust/', CommercialAdjustView.as_view()),
    path('admin-dashboard/subscriptions/', CommercialSubscriptionsView.as_view()),
    path('admin-dashboard/payments/', CommercialPaymentsView.as_view()),
    path('admin-dashboard/reports.csv', CommercialReportView.as_view()),
    path('usage/video-exports/', VideoExportView.as_view()),
    path('usage/print-exports/', PrintExportView.as_view()),
    path('plans/', PlansView.as_view()),
    path('billing/', BillingView.as_view()),
    path('billing/change/', PlanChangeView.as_view()),
    path('billing/artworks/', ArtworkCreditsView.as_view()),
    path('billing/operations/', CreditOperationView.as_view()),
    path('billing/webhooks/mercado-pago/', MercadoPagoWebhookView.as_view()),
    path('auth/register/', RegisterView.as_view()),
    path('auth/login/', LoginView.as_view()),
    path('auth/refresh/', RefreshView.as_view()),
    path('auth/logout/', LogoutView.as_view()),
    path('auth/password-reset/', PasswordResetRequestView.as_view()),
    path('auth/password-reset/confirm/', PasswordResetConfirmView.as_view()),
    path('auth/me/', MeView.as_view()),
    path(
        'campaigns/<int:campaign_id>/assets/<int:asset_id>/content/',
        CampaignAssetContentView.as_view(),
    ),
    path(
        'campaigns/<int:campaign_id>/thumbnail/content/',
        CampaignThumbnailContentView.as_view(),
    ),
    path(
        'stores/<int:store_id>/logo/content/',
        StoreBrandLogoContentView.as_view(),
    ),
] + router.urls

