# Data Model — NexESG

## Overview
This document explains the data model design for the NexESG emissions ingestion and review platform.

---

## Entities

### 1. Company
Represents a client company whose emissions data is being tracked.

| Field | Type | Purpose |
|-------|------|---------|
| id | AutoField | Primary key |
| name | CharField | Company name |
| created_at | DateTimeField | When onboarded |

**Why:** Multi-tenancy support — each emission record belongs to a company, so multiple clients can use the same platform without seeing each other's data.

---

### 2. EmissionRecord
The core table. Every row represents one normalized emissions activity — a fuel purchase, a utility bill, or a travel booking.

| Field | Type | Purpose |
|-------|------|---------|
| id | AutoField | Primary key |
| company | ForeignKey(Company) | Multi-tenant isolation |
| source | CharField | SAP / UTILITY / TRAVEL |
| source_file | CharField | Which file this came from |
| uploaded_at | DateTimeField | When it was ingested |
| scope | CharField | SCOPE1 / SCOPE2 / SCOPE3 |
| activity_date | DateField | When the activity happened |
| description | CharField | Human-readable description |
| quantity | FloatField | Raw quantity from source |
| unit | CharField | Raw unit from source |
| normalized_quantity | FloatField | Quantity in base unit |
| normalized_unit | CharField | Base unit after normalization |
| emission_factor | FloatField | kg CO2e per unit |
| co2_equivalent | FloatField | Final emission in kg CO2e |
| status | CharField | PENDING / APPROVED / FLAGGED / REJECTED |
| reviewed_by | CharField | Analyst who reviewed |
| reviewed_at | DateTimeField | When reviewed |
| review_notes | TextField | Analyst comments |
| is_edited | BooleanField | Was this record manually edited? |
| original_data | JSONField | Raw row before normalization |
| locked_for_audit | BooleanField | Cannot be changed after approval |
| created_at | DateTimeField | Record creation time |
| updated_at | DateTimeField | Last modification time |

---

## Key Design Decisions

### Multi-tenancy
Every EmissionRecord has a ForeignKey to Company. This means one database serves multiple clients with full data isolation. A query for Company A will never return Company B's data.

### Scope 1 / 2 / 3 Categorization
- **Scope 1** — Direct emissions (SAP fuel/procurement data)
- **Scope 2** — Indirect electricity emissions (Utility data)
- **Scope 3** — Value chain emissions (Corporate travel data)

This follows the GHG Protocol standard used in ESG reporting.

### Source-of-Truth Tracking
Every record stores:
- `source` — which system it came from (SAP, UTILITY, TRAVEL)
- `source_file` — which exact file upload produced it
- `uploaded_at` — timestamp of ingestion
- `original_data` — the raw JSON of the original row before normalization

This means we can always trace back: "this CO2 number came from this row in this file uploaded at this time."

### Unit Normalization
Raw data comes in inconsistent units:
- SAP fuel: liters or gallons → normalized to liters
- Utility: kWh (already standard)
- Travel: distance in km (already standard)

Both raw and normalized values are stored so auditors can verify the conversion.

### Audit Trail
- `locked_for_audit` prevents approved records from being modified
- `reviewed_by` and `reviewed_at` track who approved what and when
- `is_edited` flags any manual corrections
- `original_data` preserves the source row forever

### What I Would Add With More Time
- Separate `AuditLog` table for full change history
- `EmissionFactor` table (instead of hardcoded values) linked to source + year
- `User` model with role-based access (analyst vs admin vs auditor)