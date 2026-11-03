"""Email one-time-code sign-in: issue, verify, limits, and demo provisioning."""
from datetime import timedelta
from unittest import mock

import pytest
import requests
from django.core.cache import cache
from django.utils import timezone
from rest_framework.test import APIClient

from accounts import mailer
from accounts.models import EmailOTP, User
from api.models import Company, EmissionRecord

pytestmark = pytest.mark.django_db

REQUEST_URL = '/api/auth/otp/request/'
VERIFY_URL = '/api/auth/otp/verify/'
SEND = 'accounts.otp.send_otp_email'


@pytest.fixture(autouse=True)
def otp_settings(settings):
    settings.AUTO_DEMO_SIGNUP = True
    settings.FIRST_ADMIN_EMAIL = 'owner@example.com'
    settings.OTP_RESEND_SECONDS = 60
    settings.OTP_MAX_PER_HOUR = 5
    settings.OTP_MAX_ATTEMPTS = 5
    cache.clear()


def request_code(email='visitor@example.com'):
    """Ask for a code and return (response, the code that was 'emailed')."""
    sent = {}
    with mock.patch(SEND, side_effect=lambda to, code: sent.update(to=to, code=code)):
        res = APIClient().post(REQUEST_URL, {'email': email})
    return res, sent.get('code')


def verify(email, code):
    return APIClient().post(VERIFY_URL, {'email': email, 'code': code})


# ------------------------------------------------------------ happy path

def test_request_then_verify_gives_demo_access():
    res, code = request_code('Visitor@Example.com ')
    assert res.status_code == 200
    assert len(code) == 6 and code.isdigit()
    assert EmailOTP.objects.get().email == 'visitor@example.com'

    res = verify('visitor@example.com', code)
    assert res.status_code == 200, res.content
    body = res.json()
    assert body['access'] and body['refresh']
    assert body['user']['role'] == 'DEMO'
    assert body['user']['company_name'] == 'Demo workspace: visitor'
    assert EmissionRecord.objects.filter(company_id=body['user']['company']).count() == 12

    # The token really works.
    client = APIClient()
    client.credentials(HTTP_AUTHORIZATION=f"Bearer {body['access']}")
    assert client.get('/api/auth/me/').json()['email'] == 'visitor@example.com'


def test_code_is_not_stored_in_plain_text():
    _, code = request_code()
    assert code not in EmailOTP.objects.get().code_hash


def test_returning_visitor_keeps_one_workspace():
    for _ in range(2):
        _, code = request_code('again@example.com')
        assert verify('again@example.com', code).status_code == 200
        EmailOTP.objects.update(created_at=timezone.now() - timedelta(minutes=5))
    assert User.objects.filter(email='again@example.com').count() == 1
    assert Company.objects.count() == 1


def test_same_account_whether_google_or_email(make_user):
    existing = make_user('MANAGER')
    _, code = request_code(existing.email)
    res = verify(existing.email, code)
    assert res.json()['user']['id'] == existing.id
    assert res.json()['user']['role'] == 'MANAGER'


def test_first_admin_email_still_becomes_admin():
    _, code = request_code('owner@example.com')
    user = verify('owner@example.com', code).json()['user']
    assert user['role'] == 'ADMIN' and user['company'] is None


def test_flag_off_new_users_stay_pending(settings):
    settings.AUTO_DEMO_SIGNUP = False
    _, code = request_code('wait@example.com')
    assert verify('wait@example.com', code).json()['user']['role'] == 'PENDING'


# ---------------------------------------------------------- bad codes

def test_wrong_code_is_rejected_and_creates_no_user():
    _, code = request_code()
    wrong = '000000' if code != '000000' else '111111'
    res = verify('visitor@example.com', wrong)
    assert res.status_code == 400
    assert not User.objects.exists()


def test_code_works_only_once():
    _, code = request_code()
    assert verify('visitor@example.com', code).status_code == 200
    assert verify('visitor@example.com', code).status_code == 400


def test_code_for_one_email_does_not_work_for_another():
    _, code = request_code('a@example.com')
    request_code('b@example.com')
    assert verify('b@example.com', code).status_code == 400
    assert not User.objects.filter(email='b@example.com').exists()


def test_expired_code_is_rejected():
    _, code = request_code()
    EmailOTP.objects.update(expires_at=timezone.now() - timedelta(seconds=1))
    assert verify('visitor@example.com', code).status_code == 400


def test_too_many_wrong_guesses_lock_the_code():
    _, code = request_code()
    wrong = '000000' if code != '000000' else '111111'
    for _ in range(5):
        assert verify('visitor@example.com', wrong).status_code == 400
    # Even the right code no longer works: the attacker cannot keep guessing.
    assert verify('visitor@example.com', code).status_code == 400


def test_new_code_replaces_the_old_one():
    _, first = request_code()
    EmailOTP.objects.update(created_at=timezone.now() - timedelta(minutes=5))
    _, second = request_code()
    if first != second:
        assert verify('visitor@example.com', first).status_code == 400
    assert verify('visitor@example.com', second).status_code == 200


@pytest.mark.parametrize('payload', [
    {'email': 'not-an-email', 'code': '123456'},
    {'email': 'a@example.com', 'code': '12345'},
    {'email': 'a@example.com', 'code': 'abcdef'},
    {'email': 'a@example.com'},
    {},
])
def test_bad_input_is_a_400(payload):
    assert APIClient().post(VERIFY_URL, payload).status_code == 400


def test_bad_email_on_request_is_a_400():
    assert APIClient().post(REQUEST_URL, {'email': 'nope'}).status_code == 400
    assert APIClient().post(REQUEST_URL, {}).status_code == 400


# ------------------------------------------------------------- limits

def test_resend_cooldown():
    request_code()
    res, _ = request_code()
    assert res.status_code == 429
    assert res.json()['retry_after'] > 0
    assert EmailOTP.objects.count() == 1


def test_hourly_cap_per_email():
    for _ in range(5):
        res, _ = request_code()
        assert res.status_code == 200
        EmailOTP.objects.update(created_at=timezone.now() - timedelta(minutes=5))
    res, _ = request_code()
    assert res.status_code == 429
    assert 'Too many' in res.json()['error']


def test_request_rate_limit_per_address(settings):
    from rest_framework.settings import api_settings
    rates = dict(api_settings.DEFAULT_THROTTLE_RATES, otp_request='2/hour')
    with mock.patch('rest_framework.throttling.ScopedRateThrottle.THROTTLE_RATES', rates):
        codes = [request_code(f'u{i}@example.com')[0].status_code for i in range(3)]
    assert codes == [200, 200, 429]


# -------------------------------------------------------- email failures

def test_failed_send_returns_503_and_does_not_burn_the_limits():
    with mock.patch(SEND, side_effect=mailer.MailSendFailed()):
        res = APIClient().post(REQUEST_URL, {'email': 'x@example.com'})
    assert res.status_code == 503
    assert EmailOTP.objects.count() == 0
    # Can retry straight away: no cooldown from the failed attempt.
    res, code = request_code('x@example.com')
    assert res.status_code == 200 and code


def test_not_configured_in_production_is_503(settings):
    settings.DEBUG = False
    settings.BREVO_API_KEY = ''
    settings.EMAIL_FROM = ''
    res = APIClient().post(REQUEST_URL, {'email': 'x@example.com'})
    assert res.status_code == 503
    assert 'not set up' in res.json()['error']
    assert EmailOTP.objects.count() == 0


# ------------------------------------------------------------- mailer

def test_brevo_request_shape(settings):
    settings.BREVO_API_KEY = 'secret-key'
    settings.EMAIL_FROM = 'me@example.com'
    with mock.patch('accounts.mailer.requests.post') as post:
        mailer.send_otp_email('you@example.com', '123456')
    args, kwargs = post.call_args
    assert args[0] == 'https://api.brevo.com/v3/smtp/email'
    assert kwargs['headers']['api-key'] == 'secret-key'
    assert kwargs['json']['to'] == [{'email': 'you@example.com'}]
    assert kwargs['json']['sender']['email'] == 'me@example.com'
    assert '123456' in kwargs['json']['textContent']
    assert kwargs['timeout']


def test_brevo_failure_is_wrapped_and_does_not_leak_the_code(settings, caplog):
    settings.BREVO_API_KEY = 'secret-key'
    settings.EMAIL_FROM = 'me@example.com'
    with mock.patch('accounts.mailer.requests.post', side_effect=requests.ConnectionError('boom')):
        with pytest.raises(mailer.MailSendFailed):
            mailer.send_otp_email('you@example.com', '654321')
    assert '654321' not in caplog.text and 'secret-key' not in caplog.text


def test_dev_mode_prints_the_code(settings, capsys):
    settings.DEBUG = True
    settings.BREVO_API_KEY = ''
    mailer.send_otp_email('dev@example.com', '424242')
    assert '424242' in capsys.readouterr().out
