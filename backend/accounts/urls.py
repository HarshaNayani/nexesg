from django.urls import include, path
from rest_framework.routers import DefaultRouter
from rest_framework_simplejwt.views import TokenRefreshView

from .views import (GoogleLoginView, MeView, OtpRequestView, OtpVerifyView,
                    UserViewSet)

router = DefaultRouter()
router.register(r'users', UserViewSet, basename='user')

urlpatterns = [
    path('auth/google/', GoogleLoginView.as_view(), name='google-login'),
    path('auth/otp/request/', OtpRequestView.as_view(), name='otp-request'),
    path('auth/otp/verify/', OtpVerifyView.as_view(), name='otp-verify'),
    path('auth/refresh/', TokenRefreshView.as_view(), name='token-refresh'),
    path('auth/me/', MeView.as_view(), name='me'),
    path('', include(router.urls)),
]
