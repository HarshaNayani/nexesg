import datetime
import itertools

import pytest
from rest_framework.test import APIClient

from accounts.models import User
from api.models import Company, EmissionRecord

_counter = itertools.count(1)


@pytest.fixture
def company_a(db):
    return Company.objects.create(name='Company A')


@pytest.fixture
def company_b(db):
    return Company.objects.create(name='Company B')


@pytest.fixture
def make_user(db):
    def _make(role, company=None, email=None, **extra):
        email = email or f'{role.lower()}{next(_counter)}@example.com'
        return User.objects.create(
            username=email, email=email, role=role, company=company, **extra
        )
    return _make


@pytest.fixture
def client_for():
    def _client(user):
        client = APIClient()
        client.force_authenticate(user=user)
        return client
    return _client


@pytest.fixture
def make_record(db):
    def _make(company, status='PENDING', locked=False, **extra):
        data = dict(
            company=company,
            source='SAP',
            scope='SCOPE1',
            activity_date=datetime.date(2026, 1, 15),
            description='Diesel',
            quantity=100,
            unit='liters',
            normalized_quantity=100,
            normalized_unit='liters',
            emission_factor=2.68,
            co2_equivalent=268,
            status=status,
            locked_for_audit=locked,
        )
        data.update(extra)
        return EmissionRecord.objects.create(**data)
    return _make
