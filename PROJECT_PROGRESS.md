# Project Progress: BBT Warehouse Inbound Web App (Apps Script)

## 📌 Project Overview
Development of a Google Apps Script Web App (Mobile & Desktop) to streamline and digitize the **Inbound System** for BBT Warehouse (burger/packaging distribution). The system interacts with a Google Sheet converted from `1.xlsx`.

---

## 🏗 System Architecture & Sheet Roles
- **Spreadsheet File:** `1.xlsx` (converted to Google Sheets)
- **Key Sheets:**
  - `Inbound`: Target sheet for appending new inbound transactions.
  - `Inventory`: Source of truth for SKU stock per rack (`Nomor Rak`, `Kuantitas Sistem`, FEFO order).
  - `Master Data`: Master rack location list.
  - `COBA 1`: Pallet/Rack mapping and capacities.
  - `Outbound Request`: Outbound order input.
  - `Picking List`: Auto-generated picking allocations (FEFO logic).
  - `Dasboard`: Stock summary and accuracy dashboard.

---

## 🎯 Requirements & Business Logic (v1)
1. **SKU Selection:** Dropdown populated dynamically from `Inventory` sheet (Column A).
2. **Rack Selection & Live On-Hand Stock:**
   - User picks a `Nomor Rak` for the selected SKU.
   - UI immediately displays current On-Hand Stock (`Kuantitas Sistem`) for that SKU at the selected rack.
3. **Multi-Rack Split Allocation:**
   - Supports splitting an inbound batch across multiple racks (e.g. 100 pcs → Rack 1: 60 pcs, Rack 2: 40 pcs).
   - Supports 2 to 6+ racks per inbound entry.
4. **Write-Back Strategy:**
   - Appends entries directly to the `Inbound` sheet.
   - Existing spreadsheet formulas handle cascading stock updates to `Inventory` and other dependent sheets.
5. **UI & Language:**
   - Mobile-first, responsive, professional UI/UX using Materialize CSS.
   - Language: Bahasa Indonesia.
6. **Deferred Features (Post-v1):**
   - Rack Capacity enforcement / warnings (`COBA 1` max capacity).
   - Barcode scanning & auto-fill.

---

## 📄 File Structure & Apps Script Components

### 1. `Code.gs` (Backend - Apps Script)
- `doGet()`: Serves HTML web app interface.
- `getSKUNames()`: Fetches unique list of SKUs from `Inventory!A4:A`.
- `getRackDetailsBySKU(skuName)`: Reads `Inventory!A4:C` to return rack numbers and current stock for the chosen SKU.
- `submitInboundData(data)`: Formats and appends a new row to `Inbound`.

### 2. Frontend Files (Google Apps Script HTML Engine)
- `Index.html`: Main HTML template layout.
- `Stylesheet.html`: Custom CSS styling (Materialize integration).
- `Javascript.html`: Client-side JavaScript handling dynamic rack row additions, live stock display, calculations, and form submission.

---

## 📝 Current Status & Next Steps
- [x] Codebase & Excel structure analyzed.
- [x] Backend logic (`Code.gs`) drafted.
- [x] `Index.html`, `Stylesheet.html`, `Javascript.html` initial skeletons created.
- [ ] Complete full `Javascript.html` implementation (dynamic rack rows, stock lookup, submission handler, toast notifications).
- [ ] Deployment & integration guide for Google Apps Script Web App.
