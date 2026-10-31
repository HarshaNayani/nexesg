import csv
import io

from django.conf import settings
from django.db.models import Count, Q
from django.shortcuts import get_object_or_404
from django.utils import timezone
from rest_framework import mixins, viewsets
from rest_framework.decorators import action
from rest_framework.response import Response

from accounts.models import User
from accounts.permissions import CanReview, CanUpload, CanViewData, IsAdmin

from .models import Company, EmissionRecord
from .serializers import CompanySerializer, EmissionRecordSerializer

Role = User.Role


# --------------------------------------------------------------------------
# Row parsers: one per source. Each takes a CSV row (dict) and returns the
# source-specific fields for an EmissionRecord. Logic is unchanged from the
# original three upload actions; only the duplication is gone.
# --------------------------------------------------------------------------

TRAVEL_FACTORS = {
    'flight': 0.255,
    'hotel': 31.0,  # per night in kg CO2e
    'car': 0.21,
    'train': 0.041,
}


def parse_sap_row(row):
    quantity = float(row.get('quantity', 0))
    unit = row.get('unit', 'liters').strip().lower()

    # Normalize to liters
    normalized_quantity = quantity * 3.785 if unit == 'gallons' else quantity
    factor = 2.68  # kg CO2e per liter diesel

    return {
        'source': 'SAP',
        'scope': 'SCOPE1',
        'activity_date': row.get('date'),
        'description': row.get('description', ''),
        'quantity': quantity,
        'unit': unit,
        'normalized_quantity': normalized_quantity,
        'normalized_unit': 'liters',
        'emission_factor': factor,
        'co2_equivalent': normalized_quantity * factor,
    }


def parse_utility_row(row):
    quantity = float(row.get('kwh', 0))
    factor = 0.82  # kg CO2e per kWh (India grid)

    return {
        'source': 'UTILITY',
        'scope': 'SCOPE2',
        'activity_date': row.get('billing_date'),
        'description': row.get('meter_id', ''),
        'quantity': quantity,
        'unit': 'kwh',
        'normalized_quantity': quantity,
        'normalized_unit': 'kwh',
        'emission_factor': factor,
        'co2_equivalent': quantity * factor,
    }


def parse_travel_row(row):
    distance_km = float(row.get('distance_km', 0))
    travel_type = row.get('travel_type', 'flight').strip().lower()
    factor = TRAVEL_FACTORS.get(travel_type, 0.255)

    return {
        'source': 'TRAVEL',
        'scope': 'SCOPE3',
        'activity_date': row.get('travel_date'),
        'description': f"{row.get('traveler', '')} - {travel_type}",
        'quantity': distance_km,
        'unit': 'km',
        'normalized_quantity': distance_km,
        'normalized_unit': 'km',
        'emission_factor': factor,
        'co2_equivalent': distance_km * factor,
    }


# --------------------------------------------------------------------------
# Viewsets
# --------------------------------------------------------------------------

class CompanyViewSet(viewsets.ModelViewSet):
    """Admins manage companies. Everyone else can only see their own."""

    serializer_class = CompanySerializer

    def get_permissions(self):
        if self.action in ('list', 'retrieve'):
            return [CanViewData()]
        return [IsAdmin()]

    def get_queryset(self):
        user = self.request.user
        if user.role == Role.ADMIN:
            return Company.objects.all()
        return Company.objects.filter(id=user.company_id)


class EmissionRecordViewSet(mixins.ListModelMixin,
                            mixins.RetrieveModelMixin,
                            viewsets.GenericViewSet):
    """
    Read-only for everyone. Records only change through the workflow actions
    (upload / approve / flag / reject), never through generic PUT/PATCH/DELETE.
    """

    serializer_class = EmissionRecordSerializer

    def get_permissions(self):
        if self.action in ('approve', 'flag', 'reject'):
            return [CanReview()]
        if self.action in ('upload_sap', 'upload_utility', 'upload_travel'):
            return [CanUpload()]
        return [CanViewData()]

    def scoped_queryset(self):
        """Everything this user is allowed to see, before any query-string filters."""
        user = self.request.user
        qs = EmissionRecord.objects.all()
        if user.role == Role.ADMIN:
            return qs
        if user.company_id is None:
            return qs.none()
        qs = qs.filter(company_id=user.company_id)
        if user.role == Role.AUDITOR:
            # Auditors only see records that have been approved and locked.
            qs = qs.filter(status='APPROVED', locked_for_audit=True)
        return qs

    def get_queryset(self):
        qs = self.scoped_queryset()
        params = self.request.query_params
        if params.get('status'):
            qs = qs.filter(status=params['status'])
        if params.get('source'):
            qs = qs.filter(source=params['source'])
        # Only admins can pick a company; for others it is already fixed.
        if params.get('company') and self.request.user.role == Role.ADMIN:
            qs = qs.filter(company=params['company'])
        return qs.order_by('-activity_date', '-id')

    # ----- review workflow -------------------------------------------------

    def _review(self, request, pk, new_status, lock=False, notes_required=False):
        record = self.get_object()
        if record.locked_for_audit:
            return Response({'error': 'Record is locked for audit'}, status=400)

        notes = (request.data.get('notes') or '').strip()
        if notes_required and not notes:
            return Response({'error': 'A reason is required.'}, status=400)

        record.status = new_status
        if notes:
            record.review_notes = notes
        # Always from the authenticated user, never from the request body.
        record.reviewed_by = request.user.email
        record.reviewed_at = timezone.now()
        if lock:
            record.locked_for_audit = True
        record.save()
        return record

    @action(detail=True, methods=['post'])
    def approve(self, request, pk=None):
        result = self._review(request, pk, 'APPROVED', lock=True)
        if isinstance(result, Response):
            return result
        return Response({'message': 'Record approved and locked for audit'})

    @action(detail=True, methods=['post'])
    def flag(self, request, pk=None):
        result = self._review(request, pk, 'FLAGGED', notes_required=True)
        if isinstance(result, Response):
            return result
        return Response({'message': 'Record flagged'})

    @action(detail=True, methods=['post'])
    def reject(self, request, pk=None):
        result = self._review(request, pk, 'REJECTED', notes_required=True)
        if isinstance(result, Response):
            return result
        return Response({'message': 'Record rejected'})

    # ----- uploads ---------------------------------------------------------

    def _resolve_company(self, request):
        """Admins choose a company; everyone else is fixed to their own."""
        user = request.user
        company_id = request.data.get('company_id')

        if user.role == Role.ADMIN:
            if not company_id:
                return None, Response({'error': 'File and company_id required'}, status=400)
            return get_object_or_404(Company, id=company_id), None

        if user.company_id is None:
            return None, Response({'error': 'Your account is not assigned to a company.'},
                                  status=403)
        if company_id and str(company_id) != str(user.company_id):
            return None, Response({'error': 'You can only upload data for your own company.'},
                                  status=403)
        return user.company, None

    def _ingest(self, request, parse_row):
        file = request.FILES.get('file')
        if not file:
            return Response({'error': 'File and company_id required'}, status=400)

        company, error = self._resolve_company(request)
        if error:
            return error

        if file.size > settings.MAX_UPLOAD_BYTES:
            limit_mb = settings.MAX_UPLOAD_BYTES / (1024 * 1024)
            return Response({'error': f'File is too large (limit {limit_mb:g} MB).'}, status=413)

        try:
            decoded = file.read().decode('utf-8-sig')  # tolerates Excel's BOM
        except UnicodeDecodeError:
            return Response({'error': 'File must be a UTF-8 encoded CSV.'}, status=400)

        rows = list(csv.DictReader(io.StringIO(decoded)))
        if len(rows) > settings.MAX_UPLOAD_ROWS:
            return Response(
                {'error': f'Too many rows (limit {settings.MAX_UPLOAD_ROWS}). Split the file and upload it in parts.'},
                status=400,
            )

        records_created = 0
        errors = []

        for line_no, row in enumerate(rows, start=2):  # row 1 is the header
            try:
                fields = parse_row(row)
                EmissionRecord.objects.create(
                    company=company,
                    source_file=file.name,
                    original_data=dict(row),
                    status='PENDING',
                    **fields,
                )
                records_created += 1
            except Exception as e:
                errors.append(f'Row {line_no}: {e}')

        return Response({'records_created': records_created, 'errors': errors})

    @action(detail=False, methods=['post'])
    def upload_sap(self, request):
        return self._ingest(request, parse_sap_row)

    @action(detail=False, methods=['post'])
    def upload_utility(self, request):
        return self._ingest(request, parse_utility_row)

    @action(detail=False, methods=['post'])
    def upload_travel(self, request):
        return self._ingest(request, parse_travel_row)

    # ----- dashboard -------------------------------------------------------

    @action(detail=False, methods=['get'])
    def summary(self, request):
        counts = self.scoped_queryset().aggregate(
            total=Count('id'),
            pending=Count('id', filter=Q(status='PENDING')),
            approved=Count('id', filter=Q(status='APPROVED')),
            flagged=Count('id', filter=Q(status='FLAGGED')),
            rejected=Count('id', filter=Q(status='REJECTED')),
        )
        return Response(counts)
