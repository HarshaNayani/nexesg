from django.db import models

# Company (multi-tenant support)
class Company(models.Model):
    name = models.CharField(max_length=255)
    created_at = models.DateTimeField(auto_now_add=True)

    def __str__(self):
        return self.name


# Main emissions data model
class EmissionRecord(models.Model):

    # Source types
    SOURCE_CHOICES = [
        ('SAP', 'SAP Fuel/Procurement'),
        ('UTILITY', 'Utility Electricity'),
        ('TRAVEL', 'Corporate Travel'),
    ]

    # Scope choices (ESG standard)
    SCOPE_CHOICES = [
        ('SCOPE1', 'Scope 1 - Direct Emissions'),
        ('SCOPE2', 'Scope 2 - Electricity'),
        ('SCOPE3', 'Scope 3 - Travel/Supply Chain'),
    ]

    # Status choices
    STATUS_CHOICES = [
        ('PENDING', 'Pending Review'),
        ('APPROVED', 'Approved'),
        ('FLAGGED', 'Flagged / Suspicious'),
        ('REJECTED', 'Rejected'),
    ]

    # Which company this belongs to
    company = models.ForeignKey(Company, on_delete=models.CASCADE)

    # Source tracking
    source = models.CharField(max_length=20, choices=SOURCE_CHOICES)
    source_file = models.CharField(max_length=255, blank=True)
    uploaded_at = models.DateTimeField(auto_now_add=True)

    # Scope categorization
    scope = models.CharField(max_length=10, choices=SCOPE_CHOICES)

    # Normalized data fields
    activity_date = models.DateField()
    description = models.CharField(max_length=500, blank=True)
    quantity = models.FloatField()
    unit = models.CharField(max_length=50)  # e.g. kWh, liters, km
    normalized_quantity = models.FloatField()  # always in base unit
    normalized_unit = models.CharField(max_length=50)  # e.g. kWh, liters, km

    # Emission calculation
    emission_factor = models.FloatField(default=0.0)
    co2_equivalent = models.FloatField(default=0.0)  # in kg CO2e

    # Review workflow
    status = models.CharField(max_length=20, choices=STATUS_CHOICES, default='PENDING')
    reviewed_by = models.CharField(max_length=255, blank=True)
    reviewed_at = models.DateTimeField(null=True, blank=True)
    review_notes = models.TextField(blank=True)

    # Audit trail
    is_edited = models.BooleanField(default=False)
    original_data = models.JSONField(default=dict)  # raw data before normalization
    locked_for_audit = models.BooleanField(default=False)

    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    def __str__(self):
        return f"{self.company} | {self.source} | {self.activity_date} | {self.co2_equivalent} kg CO2e"