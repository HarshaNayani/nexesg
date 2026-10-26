from django.urls import path, include
from rest_framework.routers import DefaultRouter
from .views import CompanyViewSet, EmissionRecordViewSet

router = DefaultRouter()
router.register(r'companies', CompanyViewSet, basename='company')
router.register(r'emissions', EmissionRecordViewSet, basename='emission')

urlpatterns = [
    path('', include(router.urls)),
]
