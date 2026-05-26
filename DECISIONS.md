# Decisions — BreatheESG

## Every ambiguity I resolved and why

---

## 1. SAP Data Format
**Ambiguity:** SAP exports can be IDoc, flat file, OData, BAPI — many formats exist.

**Decision:** I chose flat file CSV export (SE16N transaction output).

**Why:** 
- Most common format sustainability teams actually receive
- Easy to simulate realistically without SAP access
- Analysts can export this without IT involvement
- IDoc and OData require middleware setup that most clients don't have configured for ESG use cases

**What I'd ask the PM:**
"Does the client have a technical SAP team who can set up OData feeds, or are we working with manual exports from the sustainability team?"

---

## 2. Utility Data Format
**Ambiguity:** Could be portal CSV, PDF bill, or API.

**Decision:** I chose portal CSV export.

**Why:**
- Most utility portals (BESCOM, Tata Power, etc.) offer CSV download
- PDF parsing is unreliable — different utilities have different bill layouts
- APIs are rare in Indian utility context
- CSV is what facilities teams actually send over email

**What I'd ask the PM:**
"Which utility providers does this client use? Some Indian utilities don't offer CSV exports at all."

---

## 3. Travel Data Format
**Ambiguity:** Concur, Navan, or similar platforms — different APIs and export formats.

**Decision:** I chose CSV export format modeled on Concur's standard report export.

**Why:**
- Concur is most common in enterprise India
- Their standard expense report CSV is well documented
- API access requires OAuth setup and admin approval — too slow for a prototype
- CSV captures all fields needed: traveler, date, type, distance

**What I'd ask the PM:**
"Does the client use Concur, Navan, or something else? And do they have an API token we can use, or are we working with manual exports?"

---

## 4. Emission Factors
**Ambiguity:** Which emission factors to use? Many standards exist.

**Decision:** I used these factors:
- Diesel: 2.68 kg CO2e per liter (DEFRA 2023)
- Electricity: 0.82 kg CO2e per kWh (India CEA grid emission factor 2022)
- Flight: 0.255 kg CO2e per km (DEFRA 2023, economy class)
- Car: 0.21 kg CO2e per km (average petrol car)
- Train: 0.041 kg CO2e per km (DEFRA 2023)
- Hotel: 31.0 kg CO2e per night (DEFRA 2023)

**What I'd ask the PM:**
"Should we use DEFRA, GHG Protocol, or the client's own emission factors? And should factors update annually?"

---

## 5. Authentication
**Ambiguity:** Should the app have login/user management?

**Decision:** I skipped authentication for the prototype.

**Why:**
- Assignment said "analyst can review" — implied single user for prototype
- Adding auth (JWT, sessions) would take significant time
- Focus was on data model and ingestion logic

**What I'd ask the PM:**
"How many analysts will use this? Do we need role separation between analyst, admin, and auditor?"

---

## 6. Database
**Decision:** SQLite for prototype, easily swappable to PostgreSQL.

**Why:**
- Zero setup for prototype
- Django ORM means switching to PostgreSQL is one settings.py change
- For production, PostgreSQL would be mandatory