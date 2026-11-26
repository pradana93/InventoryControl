# Design Document: Phase 1 — Opname Discipline & Picking List Generator

**Date:** 2026-11-26  
**Status:** Approved  
**Author:** AI Agent (Antigravity) & Warehouse Operations Lead  
**Scope:** Phase 1 (Operational Discipline & Accurate Picking)

---

## 1. Executive Summary & Intent

### 1.1 Problem Statement
- **Stock Keeper Inconsistency**: Daily physical stock counts (cycle count / opname) are irregular and lack accountability. High-value meat items and high-fluctuation items (Beef Patty, Wings, Ayam Crispy) suffer from undetected variances until month-end.
- **FEFO Bypassing**: Pickers pull items from the easiest-to-reach racks rather than the nearest expiring lots, leading to expired stock risks.
- **Terminology Mismatch**: The current menu item "Outbound" does not reflect warehouse reality: operations need a dedicated **"Picking List Generator"** that ingests Accurate ERP Rekap Orders (RO), allocates lots by strict FEFO, and outputs sequenced picking tickets.

### 1.2 Core Objectives
1. **Rename & Refine Outbound**: Transition from generic "Outbound" to **"Picking List Generator"** across all navigation, breadcrumbs, and document outputs, strictly enforcing FEFO lot sequencing from Accurate PDF Rekap Orders.
2. **Rotating Smart Cycle Count (Opname)**:
   - Introduce a prioritized daily cycle count queue targeting high-variance, negative stock, and high-value SKUs first.
   - Integrate unit pricing from the master valuation table (`Nilai Persediaan`).
   - Compute variance not just in physical units, but in **Rupiah Value** (`Selisih Rp = Qty Selisih × Unit Cost`).
   - Implement strict status categorization based on warehouse tolerance rules:
     - `Akurat`: Selisih = 0
     - `Toleransi`: $\le 1$ unit OR $\le 1.0\%$
     - `Selisih`: Discrepancy beyond tolerance, requiring supervisor verification.
3. **Accountability & Audit**: Every count submission records the operator/stock keeper identity, timestamp, system baseline, physical count, and variance.

---

## 2. Approaches Considered & Trade-offs

| Dimension | Approach A: Full Blown Mobile App with Scanner Hardware | Approach B: Guided Web Workflow with Dynamic Queue & Valuation (Recommended) | Approach C: Retain Google Sheets Opname & Excel Manual Copy |
|---|---|---|---|
| **Architecture** | Native Android/iOS scanner application with offline sync | Integrated responsive Next.js views with Supabase PostgreSQL backend | Direct Google Sheet cell edits |
| **Effort / Time** | 4-6 weeks, requires native hardware and MDM setup | **1-2 days**, leverages existing responsive web UI and live DB | 0 days, but zero guardrails |
| **Accuracy / Control** | High, but heavy adoption friction for 5 stock keepers | **High**, enforces tolerance logic, calculates Rupiah variance in real time | Very Low, manual typos, prone to slackiness |
| **Pick Sequencing** | Handheld RFID / 2D barcode scan at pick | **Accurate ERP PDF → FEFO Rack-Sequenced Picking Ticket (Screen + Print)** | Verbal dispatch or paper notes |

**Decision:** **Approach B** is selected. It immediately solves the operational bottleneck using the existing web and mobile-accessible interfaces without requiring new hardware procurement.

---

## 3. Detailed Specifications

### 3.1 Terminology & Navigation Overhaul
- **Sidebar & Menu**: Change `/outbound` route label from `"Outbound"` to `"Picking List Generator"`.
- **Icon**: Retain or upgrade to `ClipboardList` / `FileSpreadsheet`.
- **Page Title**: "Generator Picking List & Alokasi FEFO".
- **Flow**:
  1. Upload/Drop Accurate ERP "Rekap Order" PDF.
  2. System parses order lines and performs FEFO lot allocation per entity (BBB vs BBT).
  3. System sequences the pick path by Zone and Rack (`A01` $\to$ `A02` $\to$ `Floor` $\to$ `Cold Storage`).
  4. Generate printable / downloadable picking slip with explicit Expiry Dates and Rack Numbers.

### 3.2 Master Valuation Data (Nilai Persediaan)
We introduce an entity-aware unit cost field into the SKU catalog:
```sql
ALTER TABLE catalog ADD COLUMN IF NOT EXISTS unit_cost NUMERIC(14, 2) DEFAULT 0;
```
Populate `unit_cost` for both BBB (122 SKUs) and BBT (28/30 SKUs) using the data extracted from `Nilai Persediaan` sheet (e.g., Apron Rp 50,000, Ayam Crispy Rp 37,635.99, BBQ Sauce Rp 14,942.35, Beef Large Rp 93,119.87).

### 3.3 Rotating Smart Cycle Count (Opname) Logic
The Cycle Count screen will support two view modes:
1. **Dynamic Priority Queue (Rotating Focus)**:
   - Filter criteria:
     - Priority 1: High Fluctuation (Historical variance $\ne 0$ in previous 7 days)
     - Priority 2: Negative Stock or Critical DOI
     - Priority 3: High Value (Unit Cost > Rp 50,000)
     - Priority 4: Routine rotation (items not counted in the last 3 days)
2. **All SKUs Searchable Table**: Standard comprehensive list for ad-hoc full audits.

#### Tolerance & Metric Formulas:
- $\text{Selisih Unit} = \text{Stok Fisik} - \text{Stok Sistem}$
- $\text{Selisih Rp} = \text{Selisih Unit} \times \text{Unit Cost}$
- $\text{Akurasi \%} = \begin{cases} 100\% & \text{if } \text{Stok Sistem} = 0 \text{ and } \text{Stok Fisik} = 0 \\ \max\left(0, 1 - \frac{|\text{Selisih Unit}|}{\text{Stok Sistem}}\right) \times 100\% & \text{if } \text{Stok Sistem} > 0 \end{cases}$
- **Status Classification**:
  - `Akurat` $\iff |\text{Selisih Unit}| = 0$
  - `Toleransi` $\iff |\text{Selisih Unit}| \le 1 \text{ unit} \lor (100\% - \text{Akurasi}) \le 1.0\%$
  - `Selisih` $\iff$ Any variance exceeding tolerance thresholds.

### 3.4 Summary Cards for Opname Dashboard
- **Total SKU Dihitung**: Counted today vs total SKUs.
- **Tingkat Akurasi (Overall)**: Weighted % accuracy.
- **Total Selisih Rupiah**: Net financial variance (e.g. `+Rp 2,450,000` or `-Rp 14,200,000`).
- **Item Perlu Investigasi**: Count of items flagged with `Selisih`.

---

## 4. Implementation Steps

1. **Database Update**:
   - Seed `catalog.unit_cost` from the Excel files for BBB & BBT.
   - Update `stock_opname` table/view to store or compute `selisih_rp`, `tolerance_status`, and `petugas`.
2. **Navigation & Labels**:
   - Update `NavBar.tsx` to display **"Picking List Generator"** instead of "Outbound".
   - Update headers and page titles across `src/app/outbound/*`.
3. **Opname Page Redesign (`src/app/opname/page.tsx`)**:
   - Add Priority Queue tabs (`Prioritas Hari Ini` vs `Semua SKU`).
   - Add summary metrics: Akurasi %, Net Selisih (Rp), SKUs Akurat / Toleransi / Selisih.
   - Include unit cost and Selisih Rp in the table.
   - Add status badges (`Akurat` green, `Toleransi` amber, `Selisih` red).
4. **Verification**:
   - Verify on production with browser tests.
   - Check BBB and BBT entities.
