"""
Self-service demo sign-up (AUTO_DEMO_SIGNUP): every new visitor gets a private
sandbox company with sample data. Isolation between visitors is the key thing.
"""
from unittest import mock

import pytest
from django.core.files.uploadedfile import SimpleUploadedFile
from rest_framework.test import APIClient

from accounts.models import User
from api.demo import SAMPLE_ROWS
from api.models import Company, EmissionRecord

pytestmark = pytest.mark.django_db

GOOGLE_URL = '/api/auth/google/'
VERIFY = 'accounts.views.verify_google_token'


@pytest.fixture(autouse=True)
def google_settings(settings):
    settings.GOOGLE_CLIENT_ID = 'test-client-id.apps.googleusercontent.com'
    settings.FIRST_ADMIN_EMAIL = 'owner@example.com'
    settings.AUTO_DEMO_SIGNUP = True


def sign_in(email, **extra):
    claims = {'email': email, 'email_verified': True, 'given_name': email.split('@')[0].title(),
              'family_name': 'Visitor', 'picture': ''}
    claims.update(extra)
    with mock.patch(VERIFY, return_value=claims):
        res = APIClient().post(GOOGLE_URL, {'id_token': 'fake'})
    assert res.status_code == 200, res.content
    return res


def client_for_login(res):
    client = APIClient()
    client.credentials(HTTP_AUTHORIZATION=f"Bearer {res.json()['access']}")
    return client


def csv_file(text, name='mine.csv'):
    return SimpleUploadedFile(name, text.encode(), content_type='text/csv')


# --------------------------------------------------------- provisioning

def test_new_visitor_gets_demo_role_company_and_sample_data():
    user = sign_in('visitor@example.com').json()['user']
    assert user['role'] == 'DEMO'
    assert user['company'] is not None
    assert user['company_name'] == 'Demo workspace: Visitor'

    records = EmissionRecord.objects.filter(company_id=user['company'])
    assert records.count() == len(SAMPLE_ROWS)
    # All three sources and all three scopes are represented.
    assert set(records.values_list('source', flat=True)) == {'SAP', 'UTILITY', 'TRAVEL'}
    assert set(records.values_list('scope', flat=True)) == {'SCOPE1', 'SCOPE2', 'SCOPE3'}
    # A realistic mix of review states, with approved records locked.
    statuses = set(records.values_list('status', flat=True))
    assert {'PENDING', 'APPROVED', 'FLAGGED'} <= statuses
    assert all(r.locked_for_audit for r in records.filter(status='APPROVED'))
    assert not any(r.locked_for_audit for r in records.exclude(status='APPROVED'))


def test_sample_data_is_computed_by_the_real_parsers():
    user = sign_in('maths@example.com').json()['user']
    records = EmissionRecord.objects.filter(company_id=user['company'])
    gallons = records.get(unit='gallons')
    assert gallons.normalized_quantity == pytest.approx(90 * 3.785)
    assert gallons.co2_equivalent == pytest.approx(90 * 3.785 * 2.68)
    assert records.get(source='UTILITY', quantity=15000).co2_equivalent == pytest.approx(15000 * 0.82)


def test_returning_visitor_keeps_one_workspace():
    sign_in('again@example.com')
    sign_in('again@example.com')
    assert User.objects.filter(email='again@example.com').count() == 1
    assert Company.objects.filter(name__startswith='Demo workspace').count() == 1


def test_first_admin_is_not_turned_into_a_demo_user():
    user = sign_in('owner@example.com').json()['user']
    assert user['role'] == 'ADMIN'
    assert user['company'] is None
    assert Company.objects.count() == 0


def test_with_the_flag_off_new_users_stay_pending(settings):
    settings.AUTO_DEMO_SIGNUP = False
    user = sign_in('waiting@example.com').json()['user']
    assert user['role'] == 'PENDING'
    assert user['company'] is None
    assert Company.objects.count() == 0


def test_unverified_email_creates_nothing():
    with mock.patch(VERIFY, return_value={'email': 'x@example.com', 'email_verified': False}):
        res = APIClient().post(GOOGLE_URL, {'id_token': 'fake'})
    assert res.status_code == 401
    assert User.objects.count() == 0 and Company.objects.count() == 0


def test_failed_provisioning_leaves_no_half_created_user():
    with mock.patch('accounts.views.provision_demo_user', side_effect=RuntimeError('boom')):
        with mock.patch(VERIFY, return_value={'email': 'half@example.com', 'email_verified': True}):
            client = APIClient(raise_request_exception=False)
            res = client.post(GOOGLE_URL, {'id_token': 'fake'})
    assert res.status_code == 500
    assert not User.objects.filter(email='half@example.com').exists()


# ----------------------------------------------------------- isolation

def test_visitors_cannot_see_each_others_data():
    a = client_for_login(sign_in('alice@example.com'))
    b = client_for_login(sign_in('bob@example.com'))

    a_ids = {r['id'] for r in a.get('/api/emissions/').json()}
    b_ids = {r['id'] for r in b.get('/api/emissions/').json()}
    assert len(a_ids) == len(b_ids) == len(SAMPLE_ROWS)
    assert a_ids.isdisjoint(b_ids)

    # Bob cannot read or review Alice's record, even by guessing its id.
    pending_a = next(r['id'] for r in a.get('/api/emissions/').json() if r['status'] == 'PENDING')
    assert b.get(f'/api/emissions/{pending_a}/').status_code == 404
    assert b.post(f'/api/emissions/{pending_a}/approve/').status_code == 404
    assert EmissionRecord.objects.get(id=pending_a).status == 'PENDING'

    assert [c['name'] for c in b.get('/api/companies/').json()] == ['Demo workspace: Bob']
    assert b.get('/api/emissions/summary/').json()['total'] == len(SAMPLE_ROWS)


def test_visitor_cannot_upload_into_another_visitors_company():
    a_res = sign_in('alice2@example.com')
    b = client_for_login(sign_in('bob2@example.com'))
    res = b.post('/api/emissions/upload_sap/', {
        'file': csv_file('date,description,quantity,unit\n2026-01-01,x,1,liters\n'),
        'company_id': a_res.json()['user']['company'],
    })
    assert res.status_code == 403


# --------------------------------------------------------- what they can do

def test_visitor_can_upload_and_review_in_their_own_workspace():
    client = client_for_login(sign_in('tryit@example.com'))
    up = client.post('/api/emissions/upload_sap/', {
        'file': csv_file('date,description,quantity,unit\n2026-01-01,My diesel,100,liters\n')})
    assert up.status_code == 200 and up.json()['records_created'] == 1

    mine = next(r for r in client.get('/api/emissions/').json() if r['description'] == 'My diesel')
    assert client.post(f"/api/emissions/{mine['id']}/flag/", {'notes': 'check this'}).status_code == 200
    assert client.post(f"/api/emissions/{mine['id']}/reject/", {'notes': 'no'}).status_code == 200
    # Reviewer identity comes from the account, not from the request.
    rec = EmissionRecord.objects.get(id=mine['id'])
    assert rec.reviewed_by == 'tryit@example.com'


def test_visitor_cannot_use_admin_endpoints():
    client = client_for_login(sign_in('nosy@example.com'))
    assert client.get('/api/users/').status_code == 403
    assert client.post('/api/companies/', {'name': 'Mine'}).status_code == 403
    me = client.get('/api/auth/me/').json()
    assert client.patch(f"/api/users/{me['id']}/", {'role': 'ADMIN'}).status_code == 403
    assert User.objects.get(id=me['id']).role == 'DEMO'


def test_locked_sample_records_cannot_be_changed():
    client = client_for_login(sign_in('locked@example.com'))
    locked = next(r for r in client.get('/api/emissions/').json() if r['locked_for_audit'])
    assert client.post(f"/api/emissions/{locked['id']}/reject/", {'notes': 'x'}).status_code == 400


def test_admin_can_see_demo_workspaces_and_change_a_visitors_role(make_user, client_for):
    visitor_id = sign_in('promote@example.com').json()['user']['id']
    admin = make_user('ADMIN')
    client = client_for(admin)
    assert any(c['name'] == 'Demo workspace: Promote' for c in client.get('/api/companies/').json())
    res = client.patch(f'/api/users/{visitor_id}/', {'role': 'ANALYST'})
    assert res.status_code == 200
    assert User.objects.get(id=visitor_id).role == 'ANALYST'


def test_demo_role_requires_a_company_when_set_by_admin(make_user, client_for):
    admin = make_user('ADMIN')
    pending = make_user('PENDING')
    res = client_for(admin).patch(f'/api/users/{pending.id}/', {'role': 'DEMO'})
    assert res.status_code == 400


# --------------------------------------------------------- upload limits

def test_oversized_upload_is_rejected(settings):
    settings.MAX_UPLOAD_BYTES = 100
    client = client_for_login(sign_in('big@example.com'))
    before = EmissionRecord.objects.count()
    res = client.post('/api/emissions/upload_sap/', {
        'file': csv_file('date,description,quantity,unit\n' + '2026-01-01,padding padding,1,liters\n' * 20)})
    assert res.status_code == 413
    assert 'too large' in res.json()['error']
    assert EmissionRecord.objects.count() == before


def test_too_many_rows_is_rejected(settings):
    settings.MAX_UPLOAD_ROWS = 3
    client = client_for_login(sign_in('rows@example.com'))
    before = EmissionRecord.objects.count()
    body = 'date,description,quantity,unit\n' + '2026-01-01,x,1,liters\n' * 4
    res = client.post('/api/emissions/upload_sap/', {'file': csv_file(body)})
    assert res.status_code == 400
    assert 'Too many rows' in res.json()['error']
    assert EmissionRecord.objects.count() == before

    ok = client.post('/api/emissions/upload_sap/', {
        'file': csv_file('date,description,quantity,unit\n' + '2026-01-01,x,1,liters\n' * 3)})
    assert ok.json()['records_created'] == 3
