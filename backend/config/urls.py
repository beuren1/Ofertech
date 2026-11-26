from django.contrib import admin
from django.urls import include, path

from .health import health_check

urlpatterns = [
    path('api/health/', health_check, name='health-check'),
    path('admin/', admin.site.urls),
    path('api/', include('promoforge.urls')),
]
