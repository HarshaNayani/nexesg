# Tradeoffs — NexESG

## Three things I deliberately did not build and why

---

## 1. User Authentication & Role-Based Access Control

**What I skipped:** Login system, JWT tokens, analyst vs admin vs auditor roles.

**Why I skipped it:**
- The assignment asked for a working prototype in 4 days
- Authentication would add 1-2 days of work minimum
- The core value being evaluated is data ingestion and the review workflow — not login screens
- For a prototype demo, a single shared session is acceptable

**What a production version needs:**
- JWT or session-based auth
- Three roles: Admin (manages companies/users), Analyst (reviews records), Auditor (read-only, sees only locked records)
- Row-level permissions so analysts only see their assigned company's data

---

## 2. Automatic Anomaly Detection

**What I skipped:** Algorithmic flagging of suspicious records (e.g. consumption 3x higher than last month).

**Why I skipped it:**
- Requires historical baseline data to compare against
- Statistical thresholds need domain knowledge to set correctly
- Risk of false positives annoying analysts
- The manual flag button gives analysts the same outcome with their own judgment

**What a production version needs:**
- Z-score or IQR based outlier detection per meter/source
- Month-over-month comparison alerts
- Configurable thresholds per company

---

## 3. PDF Bill Parsing

**What I skipped:** Parsing utility bills that come as PDFs instead of CSVs.

**Why I skipped it:**
- PDF parsing is unreliable — every utility formats bills differently
- Would require OCR for scanned bills, adding significant complexity
- Libraries like pdfplumber work for digital PDFs but fail on scanned images
- CSV export covers 80% of real-world cases and is far more reliable

**What a production version needs:**
- Template-based PDF parser for top 5 Indian utilities
- OCR fallback using Tesseract for scanned bills
- Manual data entry UI for bills that can't be parsed automatically