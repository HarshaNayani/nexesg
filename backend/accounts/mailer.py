"""
Sends the sign-in code.

Render's free web services block outgoing SMTP, so production uses Brevo's
HTTPS API instead. Locally (DEBUG) the code is printed to the server console
so you can test without any email account.
"""
import logging

import requests
from django.conf import settings

logger = logging.getLogger(__name__)

BREVO_URL = 'https://api.brevo.com/v3/smtp/email'


class MailNotConfigured(Exception):
    pass


class MailSendFailed(Exception):
    pass


def send_otp_email(to, code):
    minutes = settings.OTP_TTL_SECONDS // 60
    subject = f'{code} is your NexESG sign-in code'
    text = (f'Your NexESG sign-in code is {code}.\n\n'
            f'It expires in {minutes} minutes. If you did not ask for it, ignore this email.')
    html = (f'<p>Your NexESG sign-in code is:</p>'
            f'<p style="font-size:28px;font-weight:700;letter-spacing:6px">{code}</p>'
            f'<p>It expires in {minutes} minutes. If you did not ask for it, ignore this email.</p>')

    if settings.BREVO_API_KEY and settings.EMAIL_FROM:
        try:
            res = requests.post(
                BREVO_URL,
                headers={'api-key': settings.BREVO_API_KEY, 'accept': 'application/json'},
                json={'sender': {'name': 'NexESG', 'email': settings.EMAIL_FROM},
                      'to': [{'email': to}], 'subject': subject,
                      'textContent': text, 'htmlContent': html},
                timeout=10,
            )
            res.raise_for_status()
        except requests.RequestException as exc:
            # Never log the code or the API key.
            logger.error('Sending sign-in email failed: %s', exc.__class__.__name__)
            raise MailSendFailed() from exc
        return

    if settings.DEBUG:
        print(f'\n[NexESG dev] Sign-in code for {to}: {code}\n')  # noqa: T201
        return

    raise MailNotConfigured()
