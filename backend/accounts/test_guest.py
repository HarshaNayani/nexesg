"""Free demo: a guest account with its own sandbox, no sign-in needed."""
from datetime import timedelta
from unittest import mock

import pytest
from django.core.cache import cache
from django.utils import timezone
from rest_framework.test import APIClient

from accounts.models import User
from accounts.views import GUEST_DOMAIN
from api.models import Company, EmissionRecord

pytestmark = pytest.mark.django_db
URL = '/api/auth/demo/'


@pytest.fixture(autouse=True)
def demo_settings(settings):
    settings.AUTO_DEMO_SIGNUP = True
    settings.DEMO_MAX_GUESTS_PER_HOUR = 100
    cache.clear()


def start():
    return APIClient().post(URL, {})


def test_guest_gets_a_demo_workspace_without_signing_in():
    res = start()
    assert res.status_code == 200, res.content
    body = res.json()
    user = body['user']
    assert user['role'] == 'DEMO'
    assert user['email'].endswith(f'@{GUEST_DOMAIN}')
    assert user['first_name'].startswith('Guest ')
    assert EmissionRecord.objects.filter(company_id=user['company']).count() == 12

    client = APIClient()
    client.credentials(HTTP_AUTHORIZATION=f"Bearer {body['access']}")
    assert client.get('/api/auth/me/').json()['id'] == user['id']
    assert len(client.get('/api/emissions/').json()) == 12


def test_guest_has_no_usable_password():
    start()
    assert not User.objects.get().has_usable_password()


def test_each_guest_is_isolated():
    a = start().json()
    b = start().json()
    assert a['user']['id'] != b['user']['id']
    assert a['user']['company'] != b['user']['company']
    client = APIClient()
    client.credentials(HTTP_AUTHORIZATION=f"Bearer {b['access']}")
    assert {c['id'] for c in client.get('/api/companies/').json()} == {b['user']['company']}


def test_guest_cannot_use_admin_endpoints():
    body = start().json()
    client = APIClient()
    client.credentials(HTTP_AUTHORIZATION=f"Bearer {body['access']}")
    assert client.get('/api/users/').status_code == 403


def test_disabled_when_demo_signup_is_off(settings):
    settings.AUTO_DEMO_SIGNUP = False
    assert start().status_code == 403
    assert User.objects.count() == 0


def test_per_address_rate_limit():
    from rest_framework.settings import api_settings
    rates = dict(api_settings.DEFAULT_THROTTLE_RATES, demo_start='2/hour')
    with mock.patch('rest_framework.throttling.ScopedRateThrottle.THROTTLE_RATES', rates):
        codes = [start().status_code for _ in range(3)]
    assert codes == [200, 200, 429]


def test_global_hourly_cap(settings):
    settings.DEMO_MAX_GUESTS_PER_HOUR = 2
    assert [start().status_code for _ in range(3)] == [200, 200, 429]
    assert User.objects.count() == 2


def test_old_guests_and_their_data_are_cleaned_up():
    old = start().json()['user']
    User.objects.filter(id=old['id']).update(date_joined=timezone.now() - timedelta(days=8))
    fresh = start().json()['user']  # starting a demo triggers the cleanup

    assert not User.objects.filter(id=old['id']).exists()
    assert not Company.objects.filter(id=old['company']).exists()
    assert not EmissionRecord.objects.filter(company_id=old['company']).exists()
    assert User.objects.filter(id=fresh['id']).exists()
    assert EmissionRecord.objects.filter(company_id=fresh['company']).count() == 12


def test_cleanup_never_touches_real_users(make_user, company_a):
    real = make_user('ANALYST', company_a)
    User.objects.filter(id=real.id).update(date_joined=timezone.now() - timedelta(days=30))
    start()
    assert User.objects.filter(id=real.id).exists()
    assert Company.objects.filter(id=company_a.id).exists()


def test_guests_are_hidden_from_the_admin_user_list(make_user, client_for):
    start()
    admin = make_user('ADMIN')
    emails = [u['email'] for u in client_for(admin).get('/api/users/').json()]
    assert emails == [admin.email]
