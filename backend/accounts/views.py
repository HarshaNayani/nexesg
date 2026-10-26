from django.conf import settings
from google.auth.transport import requests as google_requests
from google.oauth2 import id_token as google_id_token
from rest_framework import mixins, status, viewsets
from rest_framework.permissions import AllowAny, IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView
from rest_framework_simplejwt.tokens import RefreshToken

from .models import User
from .permissions import IsAdmin
from .serializers import (GoogleLoginSerializer, UserAdminUpdateSerializer,
                          UserSerializer)


def verify_google_token(token):
    """
    Verify a Google ID token and return its claims.
    Kept as its own function so tests can patch it.
    """
    return google_id_token.verify_oauth2_token(
        token, google_requests.Request(), settings.GOOGLE_CLIENT_ID
    )


class GoogleLoginView(APIView):
    """
    POST {"id_token": "<google credential>"} -> our own JWT access/refresh pair.

    Google only proves who the person is. New users start as PENDING and an
    Admin assigns the role. The one exception is FIRST_ADMIN_EMAIL, which is
    created as ADMIN so the system can be bootstrapped.
    """

    permission_classes = [AllowAny]
    authentication_classes = []

    def post(self, request):
        serializer = GoogleLoginSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        if not settings.GOOGLE_CLIENT_ID:
            return Response({'error': 'Google login is not configured on the server.'},
                            status=status.HTTP_503_SERVICE_UNAVAILABLE)

        try:
            claims = verify_google_token(serializer.validated_data['id_token'])
        except ValueError:
            return Response({'error': 'Invalid Google token.'},
                            status=status.HTTP_401_UNAUTHORIZED)

        email = (claims.get('email') or '').lower()
        if not email or not claims.get('email_verified'):
            return Response({'error': 'Google account email is not verified.'},
                            status=status.HTTP_401_UNAUTHORIZED)

        is_first_admin = email == settings.FIRST_ADMIN_EMAIL.lower()
        user, created = User.objects.get_or_create(
            email=email,
            defaults={
                'username': email,
                'first_name': claims.get('given_name', ''),
                'last_name': claims.get('family_name', ''),
                'picture': claims.get('picture', ''),
                'role': User.Role.ADMIN if is_first_admin else User.Role.PENDING,
                'is_staff': is_first_admin,
                'is_superuser': is_first_admin,
            },
        )

        if not user.is_active:
            return Response({'error': 'This account has been disabled.'},
                            status=status.HTTP_403_FORBIDDEN)

        if not created and claims.get('picture') and user.picture != claims['picture']:
            user.picture = claims['picture']
            user.save(update_fields=['picture'])

        refresh = RefreshToken.for_user(user)
        return Response({
            'access': str(refresh.access_token),
            'refresh': str(refresh),
            'user': UserSerializer(user).data,
        })


class MeView(APIView):
    """Current user. Works for PENDING users too, so the UI can show 'awaiting approval'."""

    permission_classes = [IsAuthenticated]

    def get(self, request):
        return Response(UserSerializer(request.user).data)


class UserViewSet(mixins.ListModelMixin,
                  mixins.RetrieveModelMixin,
                  mixins.UpdateModelMixin,
                  viewsets.GenericViewSet):
    """Admin-only user management: list users, assign role and company, deactivate."""

    permission_classes = [IsAdmin]
    queryset = User.objects.select_related('company').order_by('-date_joined')
    http_method_names = ['get', 'patch', 'head', 'options']

    def get_serializer_class(self):
        if self.action in ('update', 'partial_update'):
            return UserAdminUpdateSerializer
        return UserSerializer

    def partial_update(self, request, *args, **kwargs):
        user = self.get_object()
        if user == request.user:
            return Response({'error': 'You cannot change your own role or status.'},
                            status=status.HTTP_400_BAD_REQUEST)
        serializer = self.get_serializer(user, data=request.data, partial=True)
        serializer.is_valid(raise_exception=True)
        serializer.save()
        return Response(UserSerializer(user).data)
