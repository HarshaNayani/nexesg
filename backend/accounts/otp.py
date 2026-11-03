"""Email one-time-code logic: issue a code, then check it."""
import hmac
import hashlib
import secrets
from datetime import timedelta

from django.conf import settings
from django.db import transaction
from django.utils import timezone

from .mailer import send_otp_email
from .models import EmailOTP


class Cooldown(Exception):
    def __init__(self, seconds):
        super().__init__(seconds)
        self.seconds = seconds


class TooManyCodes(Exception):
    pass


def hash_code(email, code):
    return hmac.new(settings.SECRET_KEY.encode(), f'{email}:{code}'.encode(), hashlib.sha256).hexdigest()


def issue_code(email):
    """Create and email a fresh 6-digit code. Raises Cooldown / TooManyCodes / mailer errors."""
    now = timezone.now()
    EmailOTP.objects.filter(created_at__lt=now - timedelta(days=1)).delete()

    recent = EmailOTP.objects.filter(email=email)
    last = recent.first()
    if last:
        wait = settings.OTP_RESEND_SECONDS - (now - last.created_at).total_seconds()
        if wait > 0:
            raise Cooldown(int(wait) + 1)
    if recent.filter(created_at__gte=now - timedelta(hours=1)).count() >= settings.OTP_MAX_PER_HOUR:
        raise TooManyCodes()

    code = f'{secrets.randbelow(10 ** 6):06d}'
    with transaction.atomic():
        recent.filter(used=False).update(used=True)  # only the newest code works
        otp = EmailOTP.objects.create(
            email=email,
            code_hash=hash_code(email, code),
            expires_at=now + timedelta(seconds=settings.OTP_TTL_SECONDS),
        )
        # If sending fails the exception rolls this block back, so an unsent
        # code never counts against the limits.
        send_otp_email(email, code)
    return otp


def check_code(email, code):
    """True when `code` is the latest, unused, unexpired code for this email."""
    with transaction.atomic():
        otp = (EmailOTP.objects.select_for_update()
               .filter(email=email, used=False, expires_at__gt=timezone.now()).first())
        if not otp or otp.attempts >= settings.OTP_MAX_ATTEMPTS:
            return False
        otp.attempts += 1
        ok = hmac.compare_digest(otp.code_hash, hash_code(email, code))
        if ok:
            otp.used = True
        otp.save(update_fields=['attempts', 'used'])
        return ok
