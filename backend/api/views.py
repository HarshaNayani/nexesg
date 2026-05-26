from rest_framework import viewsets, status
from rest_framework.decorators import action
from rest_framework.response import Response
from django.utils import timezone
from .models import Company, EmissionRecord
from .serializers import CompanySerializer, EmissionRecordSerializer
import csv
import io
import json


class CompanyViewSet(viewsets.ModelViewSet):
    queryset = Company.objects.all()
    serializer_class = CompanySerializer


class EmissionRecordViewSet(viewsets.ModelViewSet):
    queryset = EmissionRecord.objects.all()
    serializer_class = EmissionRecordSerializer

    # Filter by status
    def get_queryset(self):
        queryset = EmissionRecord.objects.all()
        status_filter = self.request.query_params.get('status', None)
        source_filter = self.request.query_params.get('source', None)
        company_filter = self.request.query_params.get('company', None)

        if status_filter:
            queryset = queryset.filter(status=status_filter)
        if source_filter:
            queryset = queryset.filter(source=source_filter)
        if company_filter:
            queryset = queryset.filter(company=company_filter)

        return queryset

    # Approve a record
    @action(detail=True, methods=['post'])
    def approve(self, request, pk=None):
        record = self.get_object()
        if record.locked_for_audit:
            return Response({'error': 'Record is locked for audit'}, status=400)
        record.status = 'APPROVED'
        record.reviewed_by = request.data.get('reviewed_by', 'analyst')
        record.reviewed_at = timezone.now()
        record.locked_for_audit = True
        record.save()
        return Response({'message': 'Record approved and locked for audit'})

    # Flag a record as suspicious
    @action(detail=True, methods=['post'])
    def flag(self, request, pk=None):
        record = self.get_object()
        if record.locked_for_audit:
            return Response({'error': 'Record is locked for audit'}, status=400)
        record.status = 'FLAGGED'
        record.review_notes = request.data.get('notes', '')
        record.reviewed_by = request.data.get('reviewed_by', 'analyst')
        record.reviewed_at = timezone.now()
        record.save()
        return Response({'message': 'Record flagged'})

    # Reject a record
    @action(detail=True, methods=['post'])
    def reject(self, request, pk=None):
        record = self.get_object()
        if record.locked_for_audit:
            return Response({'error': 'Record is locked for audit'}, status=400)
        record.status = 'REJECTED'
        record.review_notes = request.data.get('notes', '')
        record.reviewed_by = request.data.get('reviewed_by', 'analyst')
        record.reviewed_at = timezone.now()
        record.save()
        return Response({'message': 'Record rejected'})

    # Upload SAP CSV file
    @action(detail=False, methods=['post'])
    def upload_sap(self, request):
        file = request.FILES.get('file')
        company_id = request.data.get('company_id')

        if not file or not company_id:
            return Response({'error': 'File and company_id required'}, status=400)

        company = Company.objects.get(id=company_id)
        decoded = file.read().decode('utf-8')
        reader = csv.DictReader(io.StringIO(decoded))

        records_created = 0
        errors = []

        for row in reader:
            try:
                quantity = float(row.get('quantity', 0))
                unit = row.get('unit', 'liters').strip().lower()

                # Normalize to liters
                normalized_quantity = quantity
                if unit == 'gallons':
                    normalized_quantity = quantity * 3.785

                record = EmissionRecord.objects.create(
                    company=company,
                    source='SAP',
                    scope='SCOPE1',
                    source_file=file.name,
                    activity_date=row.get('date'),
                    description=row.get('description', ''),
                    quantity=quantity,
                    unit=unit,
                    normalized_quantity=normalized_quantity,
                    normalized_unit='liters',
                    emission_factor=2.68,  # kg CO2e per liter diesel
                    co2_equivalent=normalized_quantity * 2.68,
                    original_data=dict(row),
                    status='PENDING'
                )
                records_created += 1
            except Exception as e:
                errors.append(str(e))

        return Response({
            'records_created': records_created,
            'errors': errors
        })

    # Upload Utility CSV file
    @action(detail=False, methods=['post'])
    def upload_utility(self, request):
        file = request.FILES.get('file')
        company_id = request.data.get('company_id')

        if not file or not company_id:
            return Response({'error': 'File and company_id required'}, status=400)

        company = Company.objects.get(id=company_id)
        decoded = file.read().decode('utf-8')
        reader = csv.DictReader(io.StringIO(decoded))

        records_created = 0
        errors = []

        for row in reader:
            try:
                quantity = float(row.get('kwh', 0))

                record = EmissionRecord.objects.create(
                    company=company,
                    source='UTILITY',
                    scope='SCOPE2',
                    source_file=file.name,
                    activity_date=row.get('billing_date'),
                    description=row.get('meter_id', ''),
                    quantity=quantity,
                    unit='kwh',
                    normalized_quantity=quantity,
                    normalized_unit='kwh',
                    emission_factor=0.82,  # kg CO2e per kWh (India grid)
                    co2_equivalent=quantity * 0.82,
                    original_data=dict(row),
                    status='PENDING'
                )
                records_created += 1
            except Exception as e:
                errors.append(str(e))

        return Response({
            'records_created': records_created,
            'errors': errors
        })

    # Upload Travel CSV file
    @action(detail=False, methods=['post'])
    def upload_travel(self, request):
        file = request.FILES.get('file')
        company_id = request.data.get('company_id')

        if not file or not company_id:
            return Response({'error': 'File and company_id required'}, status=400)

        company = Company.objects.get(id=company_id)
        decoded = file.read().decode('utf-8')
        reader = csv.DictReader(io.StringIO(decoded))

        records_created = 0
        errors = []

        for row in reader:
            try:
                distance_km = float(row.get('distance_km', 0))
                travel_type = row.get('travel_type', 'flight').strip().lower()

                # Emission factors per km
                factors = {
                    'flight': 0.255,
                    'hotel': 31.0,  # per night in kg CO2e
                    'car': 0.21,
                    'train': 0.041,
                }
                factor = factors.get(travel_type, 0.255)

                record = EmissionRecord.objects.create(
                    company=company,
                    source='TRAVEL',
                    scope='SCOPE3',
                    source_file=file.name,
                    activity_date=row.get('travel_date'),
                    description=f"{row.get('traveler', '')} - {travel_type}",
                    quantity=distance_km,
                    unit='km',
                    normalized_quantity=distance_km,
                    normalized_unit='km',
                    emission_factor=factor,
                    co2_equivalent=distance_km * factor,
                    original_data=dict(row),
                    status='PENDING'
                )
                records_created += 1
            except Exception as e:
                errors.append(str(e))

        return Response({
            'records_created': records_created,
            'errors': errors
        })

    # Dashboard summary stats
    @action(detail=False, methods=['get'])
    def summary(self, request):
        total = EmissionRecord.objects.count()
        pending = EmissionRecord.objects.filter(status='PENDING').count()
        approved = EmissionRecord.objects.filter(status='APPROVED').count()
        flagged = EmissionRecord.objects.filter(status='FLAGGED').count()
        rejected = EmissionRecord.objects.filter(status='REJECTED').count()

        return Response({
            'total': total,
            'pending': pending,
            'approved': approved,
            'flagged': flagged,
            'rejected': rejected,
        })