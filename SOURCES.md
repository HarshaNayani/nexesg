# Sources — NexESG

## Research on each data source

---

## 1. SAP — Fuel & Procurement Data

### What I researched:
SAP exports data through multiple mechanisms:
- **SE16N** — Table browser, exports any table as CSV/Excel
- **IDoc** — Intermediate Document format, XML-like, used for system-to-system transfer
- **OData** — REST-based API, modern SAP systems
- **BAPI** — Function modules callable via RFC

### What I learned:
- Most sustainability teams don't have OData access — they get manual CSV exports from IT
- Common tables: EKKO (purchase orders), EKPO (purchase order items), MSEG (material movements)
- Column headers can appear in German (Lieferant = Vendor, Menge = Quantity, Werk = Plant)
- Date format is often YYYYMMDD or DD.MM.YYYY
- Units are SAP internal codes (L = liters, KG = kilograms, GAL = gallons)
- Plant codes (Werk) are 4-character codes that mean nothing without a lookup table

### My sample data:
I modeled the CSV as a simplified SE16N export with columns: date, description, quantity, unit.
I included both liters and gallons to simulate unit inconsistency.
I used realistic descriptions like "Diesel Fuel - Plant A" and "Petrol - Fleet Vehicles".

### What would break in real deployment:
- German column headers would need mapping
- Plant codes need a lookup table to become meaningful
- Date formats need flexible parsing (YYYYMMDD, DD.MM.YYYY, MM/DD/YYYY)
- Some SAP exports have merged header rows that break CSV parsers
- Character encoding issues (SAP sometimes exports in ISO-8859-1, not UTF-8)

---

## 2. Utility Data — Electricity

### What I researched:
Indian utility portals studied:
- **BESCOM** (Bangalore) — offers CSV download from portal
- **Tata Power** — offers bill PDF download, no CSV
- **MSEDCL** (Maharashtra) — portal CSV available
- **TNEB** (Tamil Nadu) — limited digital export

### What I learned:
- Portal CSV exports typically include: account number, meter ID, billing period, units consumed (kWh), demand (kVA), tariff category
- Billing periods don't align with calendar months (e.g. 18th to 17th)
- Large facilities have multiple meters — one bill per meter
- Some utilities report in units (1 unit = 1 kWh), others in kWh directly
- Time-of-use tariffs split consumption into peak/off-peak

### My sample data:
I modeled a portal CSV with columns: billing_date, meter_id, kwh.
I included two meters (METER-001, METER-002) to simulate a multi-meter facility.
Consumption varies month to month realistically (13,000–16,500 kWh range).

### What would break in real deployment:
- Billing period misalignment with calendar months needs date range handling
- Multiple tariff structures (ToU, demand charges) need separate fields
- Some utilities don't offer CSV — would need PDF parser
- kVA demand data is missing from our model but needed for full Scope 2 reporting

---

## 3. Corporate Travel — Flights, Hotels, Ground Transport

### What I researched:
Platforms studied:
- **Concur** (SAP) — most common in Indian enterprises, offers standard report CSV export
- **Navan** (formerly TripActions) — modern platform, REST API available
- **Amadeus** — used by travel desks, GDS format

### What I learned:
- Concur standard expense report includes: employee name, date, expense type, amount, merchant, distance
- Flight records often have origin/destination airport codes but not distance — distance must be calculated
- Hotel records give nights stayed but not always location
- Ground transport (cab, train) may have distance or just cost
- Different travel types have very different emission factors
- Some platforms give CO2 estimates themselves — but methodologies vary

### My sample data:
I modeled a Concur-style CSV with columns: travel_date, traveler, travel_type, distance_km.
I included all four travel types: flight, hotel, car, train.
For hotels I used distance_km = 0 since emission factor is per night, not per km.
Distances are realistic: domestic flights 800-1200km, international 2500-3200km.

### What would break in real deployment:
- Airport codes need great-circle distance calculation (haversine formula)
- Hotel nights need to be extracted separately from distance
- Concur API requires OAuth 2.0 setup and admin approval
- Some companies use multiple travel platforms — need to merge and deduplicate
- Per-traveler vs per-booking granularity varies by platform