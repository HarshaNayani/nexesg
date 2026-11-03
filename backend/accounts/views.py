import secrets
from datetime import timedelta

from django.conf import settings
from django.db import transaction
from django.utils import timezone
from google.auth.transport import requests as google_requests
from google.oauth2 import id_token as google_id_token
from rest_framework import mixins, status, viewsets
from rest_framework.permissions import AllowAny, IsAuthenticated
from rest_framework.response import Response
from rest_framework.throttling import ScopedRateThrottle
from rest_framework.views import APIView
from rest_framework_simplejwt.tokens import RefreshToken

from api.demo import provision_demo_user
from api.models import Company

from . import otp
from .mailer import MailNotConfigured, MailSendFailed
from .models import User
from .permissions import IsAdmin
from .serializers import (GoogleLoginSerializer, OtpRequestSerializer,
                          OtpVerifySerializer, UserAdminUpdateSerializer,
                          UserSerializer)


def verify_google_token(token):
    """
    Verify a Google ID token and return its claims.
    Kept as its own function so tests can patch it.
    """
    return google_id_token.verify_oauth2_token(
        token, google_requests.Request(), settings.GOOGLE_CLIENT_ID
    )


def get_or_create_login_user(email, first_name='', last_name='', picture=''):
    """
    Shared by Google and email-code sign-in: both prove the person controls
    `email`. FIRST_ADMIN_EMAIL becomes ADMIN; other new users get a private demo
    workspace (AUTO_DEMO_SIGNUP) or wait as PENDING.
    """
    is_first_admin = email == settings.FIRST_ADMIN_EMAIL.lower()
    with transaction.atomic():
        user, created = User.objects.get_or_create(
            email=email,
            defaults={
                'username': email,
                'first_name': first_name,
                'last_name': last_name,
                'picture': picture,
                'role': User.Role.ADMIN if is_first_admin else User.Role.PENDING,
                'is_staff': is_first_admin,
                'is_superuser': is_first_admin,
            },
        )
        if created and not is_first_admin and settings.AUTO_DEMO_SIGNUP:
            provision_demo_user(user)
    return user, created


def token_response(user):
    refresh = RefreshToken.for_user(user)
    return Response({
        'access': str(refresh.access_token),
        'refresh': str(refresh),
        'user': UserSerializer(user).data,
    })


GUEST_DOMAIN = 'guest.nexesg.invalid'  # the .invalid TLD can never receive mail
GUEST_RETENTION = timedelta(days=7)  # same as the refresh-token lifetime


def guest_users():
    return User.objects.filter(email__endswith=f'@{GUEST_DOMAIN}')


def delete_old_guests():
    """Remove expired guest accounts and their sandbox data so the database stays small."""
    old = guest_users().filter(date_joined__lt=timezone.now() - GUEST_RETENTION)
    company_ids = list(old.exclude(company=None).values_list('company_id', flat=True))
    Company.objects.filter(id__in=company_ids).delete()  # cascades to their records
    old.delete()


class DemoStartView(APIView):
    """
    POST {} -> a throw-away guest account with its own sample workspace, so a
    visitor can look around without signing in. Guests are limited by the same
    DEMO role as signed-in visitors and are deleted after a week.
    """

    permission_classes = [AllowAny]
    authentication_classes = []
    throttle_classes = [ScopedRateThrottle]
    throttle_scope = 'demo_start'

    def post(self, request):
        if not settings.AUTO_DEMO_SIGNUP:
            return Response({'error': 'The free demo is not available right now.'},
                            status=status.HTTP_403_FORBIDDEN)

        delete_old_guests()
        last_hour = timezone.now() - timedelta(hours=1)
        if guest_users().filter(date_joined__gte=last_hour).count() >= settings.DEMO_MAX_GUESTS_PER_HOUR:
            return Response({'error': 'The demo is very busy. Please try again in a few minutes.'},
                            status=status.HTTP_429_TOO_MANY_REQUESTS)

        tag = secrets.token_hex(3)
        email = f'guest-{tag}@{GUEST_DOMAIN}'
        with transaction.atomic():
            user = User(username=email, email=email, first_name=f'Guest {tag}', role=User.Role.PENDING)
            user.set_unusable_password()
            user.save()
            provision_demo_user(user)
        return token_response(user)


class GoogleLoginView(APIView):
    """
    POST {"id_token": "<google credential>"} -> our own JWT access/refresh pair.

    Google only proves who the person is. FIRST_ADMIN_EMAIL is created as ADMIN
    so the system can be bootstrapped. Every other new user either gets a private
    demo workspace (AUTO_DEMO_SIGNUP=true) or starts as PENDING until an Admin
    assigns a role.
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

        user, created = get_or_create_login_user(
            email,
            first_name=claims.get('given_name', ''),
            last_name=claims.get('family_name', ''),
            picture=claims.get('picture', ''),
        )
        if not user.is_active:
            return Response({'error': 'This account has been disabled.'},
                            status=status.HTTP_403_FORBIDDEN)

        if not created and claims.get('picture') and user.picture != claims['picture']:
            user.picture = claims['picture']
            user.save(update_fields=['picture'])

        return token_response(user)


class OtpRequestView(APIView):
    """POST {"email"} -> emails a 6-digit sign-in code."""

    permission_classes = [AllowAny]
    authentication_classes = []
    throttle_classes = [ScopedRateThrottle]
    throttle_scope = 'otp_request'

    def post(self, request):
        serializer = OtpRequestSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        email = serializer.validated_data['email']

        try:
            otp.issue_code(email)
        except otp.Cooldown as exc:
            return Response({'error': f'Please wait {exc.seconds} seconds before asking for another code.',
                             'retry_after': exc.seconds},
                            status=status.HTTP_429_TOO_MANY_REQUESTS)
        except otp.TooManyCodes:
            return Response({'error': 'Too many codes requested for this email. Try again in an hour.'},
                            status=status.HTTP_429_TOO_MANY_REQUESTS)
        except MailNotConfigured:
            return Response({'error': 'Email sign-in is not set up on the server yet.'},
                            status=status.HTTP_503_SERVICE_UNAVAILABLE)
        except MailSendFailed:
            return Response({'error': 'Could not send the email. Please try again in a moment.'},
                            status=status.HTTP_503_SERVICE_UNAVAILABLE)

        return Response({'detail': 'Code sent.',
                         'resend_in': settings.OTP_RESEND_SECONDS,
                         'expires_in': settings.OTP_TTL_SECONDS})


class OtpVerifyView(APIView):
    """POST {"email", "code"} -> our own JWT pair, same shape as the Google login."""

    permission_classes = [AllowAny]
    authentication_classes = []
    throttle_classes = [ScopedRateThrottle]
    throttle_scope = 'otp_verify'

    def post(self, request):
        serializer = OtpVerifySerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        email = serializer.validated_data['email']

        if not otp.check_code(email, serializer.validated_data['code']):
            return Response({'error': 'That code is wrong or has expired. Request a new one.'},
                            status=status.HTTP_400_BAD_REQUEST)

        user, _ = get_or_create_login_user(email)
        if not user.is_active:
            return Response({'error': 'This account has been disabled.'},
                            status=status.HTTP_403_FORBIDDEN)
        return token_response(user)


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
    # Guest demo accounts are throw-away, so they are kept out of the admin's list.
    queryset = (User.objects.select_related('company')
                .exclude(email__endswith=f'@{GUEST_DOMAIN}').order_by('-date_joined'))
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
