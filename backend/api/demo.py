"""
Private demo workspaces.

When AUTO_DEMO_SIGNUP is on, every new visitor gets their own sandbox company
filled with sample records, so they can try uploading, approving and flagging
without seeing anyone else's data or touching real data.
"""
import datetime

from django.db import transaction
from django.utils import timezone

from accounts.models import User

from .models import Company, EmissionRecord
from .views import parse_sap_row, parse_travel_row, parse_utility_row

REVIEWER = 'sample.manager@nexesg.demo'

# (parser, days ago, raw row as it would appear in the uploaded CSV)
SAMPLE_ROWS = [
    # SAP fuel (Scope 1)
    (parse_sap_row, 75, {'description': 'Diesel fuel - Plant A', 'quantity': '500', 'unit': 'liters'}),
    (parse_sap_row, 60, {'description': 'Petrol - company vehicles', 'quantity': '200', 'unit': 'liters'}),
    (parse_sap_row, 45, {'description': 'Diesel fuel - generator', 'quantity': '90', 'unit': 'gallons'}),
    (parse_sap_row, 20, {'description': 'Diesel fuel - Plant B', 'quantity': '420', 'unit': 'liters'}),
    # Utility electricity (Scope 2)
    (parse_utility_row, 70, {'meter_id': 'METER-001', 'kwh': '15000'}),
    (parse_utility_row, 68, {'meter_id': 'METER-002', 'kwh': '8500'}),
    (parse_utility_row, 40, {'meter_id': 'METER-001', 'kwh': '14200'}),
    (parse_utility_row, 10, {'meter_id': 'METER-002', 'kwh': '29100'}),
    # Corporate travel (Scope 3)
    (parse_travel_row, 65, {'traveler': 'Asha Rao', 'travel_type': 'flight', 'distance_km': '1200'}),
    (parse_travel_row, 50, {'traveler': 'Vikram Shah', 'travel_type': 'car', 'distance_km': '350'}),
    (parse_travel_row, 30, {'traveler': 'Meera Iyer', 'travel_type': 'train', 'distance_km': '800'}),
    (parse_travel_row, 12, {'traveler': 'Rohan Das', 'travel_type': 'flight', 'distance_km': '2500'}),
]

# Which sample records start out reviewed (index into SAMPLE_ROWS).
APPROVED = {0, 4, 8}
FLAGGED = {7: 'Usage is three times higher than last month. Please confirm the meter reading.'}

DATE_FIELD = {
    parse_sap_row: 'date',
    parse_utility_row: 'billing_date',
    parse_travel_row: 'travel_date',
}


def seed_sample_records(company):
    """Create the sample records for a company. Returns how many were created."""
    today = timezone.localdate()
    now = timezone.now()

    for index, (parse_row, days_ago, raw) in enumerate(SAMPLE_ROWS):
        row = dict(raw)
        row[DATE_FIELD[parse_row]] = (today - datetime.timedelta(days=days_ago)).isoformat()

        record = EmissionRecord(
            company=company,
            source_file='sample_data.csv',
            original_data=row,
            status='PENDING',
            **parse_row(row),
        )
        if index in APPROVED:
            record.status = 'APPROVED'
            record.locked_for_audit = True
            record.reviewed_by = REVIEWER
            record.reviewed_at = now
        elif index in FLAGGED:
            record.status = 'FLAGGED'
            record.review_notes = FLAGGED[index]
            record.reviewed_by = REVIEWER
            record.reviewed_at = now
        record.save()

    return len(SAMPLE_ROWS)


@transaction.atomic
def provision_demo_user(user):
    """Give a new user a private sandbox company with sample data and the DEMO role."""
    label = (user.first_name or user.email.split('@')[0]).strip()
    company = Company.objects.create(name=f'Demo workspace: {label}')
    seed_sample_records(company)

    user.role = User.Role.DEMO
    user.company = company
    user.save(update_fields=['role', 'company'])
    return company
