"""Google login, JWT and admin user-management tests."""
from unittest import mock

import pytest
from rest_framework.test import APIClient

from accounts.models import User

pytestmark = pytest.mark.django_db

GOOGLE_URL = '/api/auth/google/'
VERIFY = 'accounts.views.verify_google_token'


@pytest.fixture(autouse=True)
def google_settings(settings):
    settings.GOOGLE_CLIENT_ID = 'test-client-id.apps.googleusercontent.com'
    settings.FIRST_ADMIN_EMAIL = 'owner@example.com'


def claims(email='new.user@example.com', **extra):
    base = {'email': email, 'email_verified': True, 'given_name': 'New',
            'family_name': 'User', 'picture': 'https://example.com/p.png'}
    base.update(extra)
    return base


def login(**kw):
    with mock.patch(VERIFY, return_value=claims(**kw)):
        return APIClient().post(GOOGLE_URL, {'id_token': 'fake'})


# ------------------------------------------------------------ google login

def test_new_user_is_created_pending_and_gets_tokens():
    res = login()
    assert res.status_code == 200
    body = res.json()
    assert body['user']['role'] == 'PENDING'
    assert body['user']['email'] == 'new.user@example.com'
    assert body['access'] and body['refresh']
    assert User.objects.get(email='new.user@example.com').role == 'PENDING'


def test_first_admin_email_becomes_admin():
    res = login(email='Owner@Example.com')  # case-insensitive match
    assert res.json()['user']['role'] == 'ADMIN'
    assert User.objects.get(email='owner@example.com').is_staff is True


def test_returning_user_keeps_their_role():
    login()
    User.objects.filter(email='new.user@example.com').update(role='MANAGER')
    assert login().json()['user']['role'] == 'MANAGER'
    assert User.objects.filter(email='new.user@example.com').count() == 1


def test_invalid_google_token_is_rejected():
    with mock.patch(VERIFY, side_effect=ValueError('bad token')):
        res = APIClient().post(GOOGLE_URL, {'id_token': 'garbage'})
    assert res.status_code == 401
    assert User.objects.count() == 0


def test_unverified_email_is_rejected():
    assert login(email_verified=False).status_code == 401
    assert User.objects.count() == 0


def test_missing_token_is_400():
    assert APIClient().post(GOOGLE_URL, {}).status_code == 400


def test_login_not_configured_is_503(settings):
    settings.GOOGLE_CLIENT_ID = ''
    assert APIClient().post(GOOGLE_URL, {'id_token': 'x'}).status_code == 503


def test_disabled_user_cannot_log_in():
    login()
    User.objects.filter(email='new.user@example.com').update(is_active=False)
    assert login().status_code == 403


# ---------------------------------------------------------------- jwt + me

def test_access_token_authenticates_and_pending_can_read_me():
    access = login().json()['access']
    client = APIClient()
    client.credentials(HTTP_AUTHORIZATION=f'Bearer {access}')
    me = client.get('/api/auth/me/')
    assert me.status_code == 200
    assert me.json()['role'] == 'PENDING'
    # ...but a pending user still cannot read data.
    assert client.get('/api/emissions/').status_code == 403


def test_refresh_token_issues_new_access_token():
    refresh = login().json()['refresh']
    res = APIClient().post('/api/auth/refresh/', {'refresh': refresh})
    assert res.status_code == 200
    assert res.json()['access']


def test_garbage_bearer_token_is_401():
    client = APIClient()
    client.credentials(HTTP_AUTHORIZATION='Bearer not-a-token')
    assert client.get('/api/auth/me/').status_code == 401


# --------------------------------------------------------- user management

def test_admin_assigns_role_and_company(make_user, client_for, company_a):
    admin = make_user('ADMIN')
    pending = make_user('PENDING')
    res = client_for(admin).patch(
        f'/api/users/{pending.id}/', {'role': 'ANALYST', 'company': company_a.id}
    )
    assert res.status_code == 200
    pending.refresh_from_db()
    assert (pending.role, pending.company_id) == ('ANALYST', company_a.id)


def test_scoped_roles_require_a_company(make_user, client_for):
    admin = make_user('ADMIN')
    pending = make_user('PENDING')
    for role in ('ANALYST', 'MANAGER', 'AUDITOR'):
        res = client_for(admin).patch(f'/api/users/{pending.id}/', {'role': role})
        assert res.status_code == 400, role
    pending.refresh_from_db()
    assert pending.role == 'PENDING'


def test_admin_cannot_change_own_role(make_user, client_for):
    admin = make_user('ADMIN')
    res = client_for(admin).patch(f'/api/users/{admin.id}/', {'role': 'PENDING'})
    assert res.status_code == 400
    admin.refresh_from_db()
    assert admin.role == 'ADMIN'


def test_admin_can_deactivate_user(make_user, client_for, company_a):
    admin = make_user('ADMIN')
    user = make_user('ANALYST', company_a)
    res = client_for(admin).patch(f'/api/users/{user.id}/', {'is_active': False})
    assert res.status_code == 200
    user.refresh_from_db()
    assert user.is_active is False


@pytest.mark.parametrize('role', ['PENDING', 'ANALYST', 'MANAGER', 'AUDITOR'])
def test_non_admins_cannot_manage_users(role, make_user, client_for, company_a):
    actor = make_user(role, company_a)
    target = make_user('PENDING')
    client = client_for(actor)
    assert client.get('/api/users/').status_code == 403
    assert client.patch(f'/api/users/{target.id}/', {'role': 'ADMIN'}).status_code == 403
    target.refresh_from_db()
    assert target.role == 'PENDING'


def test_user_list_and_no_delete_or_create(make_user, client_for):
    admin = make_user('ADMIN')
    make_user('PENDING')
    client = client_for(admin)
    assert len(client.get('/api/users/').json()) == 2
    assert client.post('/api/users/', {'email': 'x@y.com'}).status_code == 405
    assert client.delete(f'/api/users/{admin.id}/').status_code == 405
