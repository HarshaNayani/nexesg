"""
Permission matrix and workflow tests for the emissions API.

Roles: ADMIN (everything), MANAGER (review), ANALYST (upload + view),
AUDITOR (read-only, approved+locked records), PENDING (nothing).
"""
import pytest
from django.core.files.uploadedfile import SimpleUploadedFile
from rest_framework.test import APIClient

from api.models import EmissionRecord

pytestmark = pytest.mark.django_db

LIST_URL = '/api/emissions/'
SUMMARY_URL = '/api/emissions/summary/'


def csv_file(text, name='data.csv', encoding='utf-8'):
    return SimpleUploadedFile(name, text.encode(encoding), content_type='text/csv')


SAP_CSV = 'date,description,quantity,unit\n2026-02-01,Diesel,100,liters\n2026-02-02,Diesel,10,gallons\n'


# ----------------------------------------------------------------- access

def test_unauthenticated_is_rejected():
    assert APIClient().get(LIST_URL).status_code == 401
    assert APIClient().get('/api/companies/').status_code == 401


def test_pending_user_gets_nothing(make_user, client_for, company_a, make_record):
    make_record(company_a)
    pending = make_user('PENDING', company_a)
    client = client_for(pending)
    assert client.get(LIST_URL).status_code == 403
    assert client.get(SUMMARY_URL).status_code == 403
    assert client.get('/api/companies/').status_code == 403
    upload = client.post('/api/emissions/upload_sap/', {'file': csv_file(SAP_CSV)})
    assert upload.status_code == 403


# ---------------------------------------------------------------- analyst

def test_analyst_sees_only_own_company(make_user, client_for, company_a, company_b, make_record):
    mine = make_record(company_a)
    make_record(company_b)
    res = client_for(make_user('ANALYST', company_a)).get(LIST_URL)
    assert res.status_code == 200
    assert [r['id'] for r in res.json()] == [mine.id]


def test_analyst_can_upload_for_own_company(make_user, client_for, company_a):
    analyst = make_user('ANALYST', company_a)
    res = client_for(analyst).post('/api/emissions/upload_sap/', {'file': csv_file(SAP_CSV)})
    assert res.status_code == 200
    assert res.json()['records_created'] == 2
    assert EmissionRecord.objects.filter(company=company_a, status='PENDING').count() == 2


def test_analyst_cannot_upload_for_other_company(make_user, client_for, company_a, company_b):
    analyst = make_user('ANALYST', company_a)
    res = client_for(analyst).post(
        '/api/emissions/upload_sap/',
        {'file': csv_file(SAP_CSV), 'company_id': company_b.id},
    )
    assert res.status_code == 403
    assert EmissionRecord.objects.count() == 0


def test_analyst_without_company_cannot_upload(make_user, client_for):
    res = client_for(make_user('ANALYST')).post(
        '/api/emissions/upload_sap/', {'file': csv_file(SAP_CSV)}
    )
    assert res.status_code == 403


def test_analyst_cannot_review(make_user, client_for, company_a, make_record):
    record = make_record(company_a)
    client = client_for(make_user('ANALYST', company_a))
    for action in ('approve', 'flag', 'reject'):
        res = client.post(f'{LIST_URL}{record.id}/{action}/', {'notes': 'x'})
        assert res.status_code == 403, action
    record.refresh_from_db()
    assert record.status == 'PENDING'


# ---------------------------------------------------------------- manager

def test_manager_approve_locks_and_uses_authenticated_identity(
        make_user, client_for, company_a, make_record):
    record = make_record(company_a)
    manager = make_user('MANAGER', company_a, email='boss@example.com')
    # The body tries to spoof the reviewer; it must be ignored.
    res = client_for(manager).post(
        f'{LIST_URL}{record.id}/approve/', {'reviewed_by': 'someone-else@example.com'}
    )
    assert res.status_code == 200
    record.refresh_from_db()
    assert record.status == 'APPROVED'
    assert record.locked_for_audit is True
    assert record.reviewed_by == 'boss@example.com'
    assert record.reviewed_at is not None


def test_flag_and_reject_require_a_reason(make_user, client_for, company_a, make_record):
    record = make_record(company_a)
    client = client_for(make_user('MANAGER', company_a))
    for action in ('flag', 'reject'):
        assert client.post(f'{LIST_URL}{record.id}/{action}/', {}).status_code == 400
        assert client.post(f'{LIST_URL}{record.id}/{action}/', {'notes': '  '}).status_code == 400
    record.refresh_from_db()
    assert record.status == 'PENDING'

    assert client.post(f'{LIST_URL}{record.id}/flag/', {'notes': 'Too high'}).status_code == 200
    record.refresh_from_db()
    assert record.status == 'FLAGGED'
    assert record.review_notes == 'Too high'
    assert record.locked_for_audit is False


def test_manager_cannot_touch_other_company_record(make_user, client_for, company_a, company_b, make_record):
    other = make_record(company_b)
    client = client_for(make_user('MANAGER', company_a))
    assert client.post(f'{LIST_URL}{other.id}/approve/').status_code == 404
    other.refresh_from_db()
    assert other.status == 'PENDING'


def test_manager_cannot_upload(make_user, client_for, company_a):
    res = client_for(make_user('MANAGER', company_a)).post(
        '/api/emissions/upload_sap/', {'file': csv_file(SAP_CSV)}
    )
    assert res.status_code == 403


# ---------------------------------------------------------------- auditor

def test_auditor_only_sees_approved_locked_own_company(
        make_user, client_for, company_a, company_b, make_record):
    visible = make_record(company_a, status='APPROVED', locked=True)
    make_record(company_a, status='PENDING')
    make_record(company_a, status='FLAGGED')
    make_record(company_b, status='APPROVED', locked=True)

    client = client_for(make_user('AUDITOR', company_a))
    ids = [r['id'] for r in client.get(LIST_URL).json()]
    assert ids == [visible.id]
    assert client.get(SUMMARY_URL).json()['total'] == 1


def test_auditor_is_read_only(make_user, client_for, company_a, make_record):
    record = make_record(company_a, status='APPROVED', locked=True)
    client = client_for(make_user('AUDITOR', company_a))
    assert client.get(f'{LIST_URL}{record.id}/').status_code == 200
    assert client.post(f'{LIST_URL}{record.id}/approve/').status_code == 403
    assert client.post('/api/emissions/upload_sap/', {'file': csv_file(SAP_CSV)}).status_code == 403


# ------------------------------------------------------------------ admin

def test_admin_sees_everything_and_can_filter_by_company(
        make_user, client_for, company_a, company_b, make_record):
    make_record(company_a)
    b_record = make_record(company_b)
    client = client_for(make_user('ADMIN'))
    assert len(client.get(LIST_URL).json()) == 2
    filtered = client.get(LIST_URL, {'company': company_b.id}).json()
    assert [r['id'] for r in filtered] == [b_record.id]


def test_admin_upload_needs_company_id(make_user, client_for, company_a):
    client = client_for(make_user('ADMIN'))
    missing = client.post('/api/emissions/upload_sap/', {'file': csv_file(SAP_CSV)})
    assert missing.status_code == 400
    ok = client.post('/api/emissions/upload_sap/',
                     {'file': csv_file(SAP_CSV), 'company_id': company_a.id})
    assert ok.status_code == 200
    unknown = client.post('/api/emissions/upload_sap/',
                          {'file': csv_file(SAP_CSV), 'company_id': 9999})
    assert unknown.status_code == 404


def test_non_admin_company_filter_is_ignored(make_user, client_for, company_a, company_b, make_record):
    make_record(company_a)
    make_record(company_b)
    client = client_for(make_user('MANAGER', company_a))
    res = client.get(LIST_URL, {'company': company_b.id}).json()
    assert len(res) == 1


# -------------------------------------------------------- audit integrity

def test_locked_record_cannot_be_reviewed_again(make_user, client_for, company_a, make_record):
    record = make_record(company_a, status='APPROVED', locked=True)
    client = client_for(make_user('MANAGER', company_a))
    for action in ('approve', 'flag', 'reject'):
        res = client.post(f'{LIST_URL}{record.id}/{action}/', {'notes': 'x'})
        assert res.status_code == 400, action
    record.refresh_from_db()
    assert record.status == 'APPROVED'


def test_records_cannot_be_edited_or_deleted_directly(make_user, client_for, company_a, make_record):
    record = make_record(company_a)
    client = client_for(make_user('ADMIN'))
    url = f'{LIST_URL}{record.id}/'
    assert client.put(url, {'co2_equivalent': 0}).status_code == 405
    assert client.patch(url, {'co2_equivalent': 0}).status_code == 405
    assert client.delete(url).status_code == 405
    assert client.post(LIST_URL, {}).status_code == 405
    record.refresh_from_db()
    assert record.co2_equivalent == 268


# ---------------------------------------------------------------- summary

def test_summary_is_scoped_and_counts_by_status(make_user, client_for, company_a, company_b, make_record):
    make_record(company_a, status='PENDING')
    make_record(company_a, status='FLAGGED')
    make_record(company_b, status='PENDING')
    res = client_for(make_user('MANAGER', company_a)).get(SUMMARY_URL).json()
    assert res == {'total': 2, 'pending': 1, 'approved': 0, 'flagged': 1, 'rejected': 0}


# ---------------------------------------------------------------- uploads

def test_sap_upload_normalizes_gallons_and_computes_co2(make_user, client_for, company_a):
    client_for(make_user('ANALYST', company_a)).post(
        '/api/emissions/upload_sap/', {'file': csv_file(SAP_CSV)}
    )
    liters = EmissionRecord.objects.get(quantity=100)
    gallons = EmissionRecord.objects.get(quantity=10)
    assert liters.co2_equivalent == pytest.approx(100 * 2.68)
    assert gallons.normalized_quantity == pytest.approx(37.85)
    assert gallons.co2_equivalent == pytest.approx(37.85 * 2.68)
    assert gallons.scope == 'SCOPE1' and gallons.source == 'SAP'
    assert gallons.source_file == 'data.csv'
    assert gallons.original_data['unit'] == 'gallons'


def test_utility_and_travel_uploads(make_user, client_for, company_a):
    client = client_for(make_user('ANALYST', company_a))
    util = client.post('/api/emissions/upload_utility/', {
        'file': csv_file('billing_date,meter_id,kwh\n2026-03-01,M1,1000\n')})
    travel = client.post('/api/emissions/upload_travel/', {
        'file': csv_file('travel_date,traveler,travel_type,distance_km\n2026-03-02,Asha,train,500\n')})
    assert util.json()['records_created'] == 1
    assert travel.json()['records_created'] == 1
    u = EmissionRecord.objects.get(source='UTILITY')
    t = EmissionRecord.objects.get(source='TRAVEL')
    assert (u.scope, u.co2_equivalent) == ('SCOPE2', pytest.approx(820))
    assert (t.scope, t.co2_equivalent) == ('SCOPE3', pytest.approx(500 * 0.041))


def test_bad_rows_are_reported_with_row_numbers(make_user, client_for, company_a):
    text = 'date,description,quantity,unit\n2026-02-01,Diesel,abc,liters\n2026-02-02,Diesel,5,liters\n'
    res = client_for(make_user('ANALYST', company_a)).post(
        '/api/emissions/upload_sap/', {'file': csv_file(text)}
    ).json()
    assert res['records_created'] == 1
    assert len(res['errors']) == 1
    assert res['errors'][0].startswith('Row 2:')


def test_excel_bom_and_non_utf8_files(make_user, client_for, company_a):
    client = client_for(make_user('ANALYST', company_a))
    bom = SimpleUploadedFile('bom.csv', b'\xef\xbb\xbf' + SAP_CSV.encode(), content_type='text/csv')
    assert client.post('/api/emissions/upload_sap/', {'file': bom}).json()['records_created'] == 2

    bad = SimpleUploadedFile('bad.csv', b'\xff\xfe\x00bad', content_type='text/csv')
    assert client.post('/api/emissions/upload_sap/', {'file': bad}).status_code == 400


def test_upload_without_file_is_400(make_user, client_for, company_a):
    res = client_for(make_user('ANALYST', company_a)).post('/api/emissions/upload_sap/', {})
    assert res.status_code == 400


# -------------------------------------------------------------- companies

def test_company_endpoints_by_role(make_user, client_for, company_a, company_b):
    analyst = client_for(make_user('ANALYST', company_a))
    names = [c['name'] for c in analyst.get('/api/companies/').json()]
    assert names == ['Company A']
    assert analyst.post('/api/companies/', {'name': 'Evil Corp'}).status_code == 403

    admin = client_for(make_user('ADMIN'))
    assert len(admin.get('/api/companies/').json()) == 2
    assert admin.post('/api/companies/', {'name': 'New Co'}).status_code == 201
