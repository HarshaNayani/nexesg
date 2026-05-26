from django.urls import path, include
from rest_framework.routers import DefaultRouter
from .views import CompanyViewSet, EmissionRecordViewSet

router = DefaultRouter()
router.register(r'companies', CompanyViewSet)
router.register(r'emissions', EmissionRecordViewSet)

urlpatterns = [
    path('', include(router.urls)),
]