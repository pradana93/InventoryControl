# Phase 2 — Inventory Calculator & Auto ROP Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Port the Excel `Calculator` sheet logic (DOI, ROP, Safety Stock, Coverage, Forecast, Saran Order) into Next.js with real-time Dashboard alerts, entity-aware filtering, and an Admin/Manager UI for parameter tuning.

**Architecture:** Incremental feature development within the existing Next.js 16 / Supabase stack. Core calculation logic implemented as pure TypeScript functions in `src/lib/inventory-calculator.ts` for testability. New API routes under `/api/inventory/calculator` expose the results. Dashboard UI components display KRITIS/Aman/Overstock alerts. Admin settings page allows configuring Safety Stock days per SKU/entity.

**Tech Stack:** Next.js 16, React, TypeScript, Tailwind CSS, shadcn/ui, Supabase (PostgreSQL), lucide-react icons.

**Spec:** `docs/superpowers/specs/2026-11-26-opname-fefo-enforcement-design.md` (Phase 2 section) + Excel files `BBB - Inventory Calculator.xlsx` / `BBT - Inventory Calculator.xlsx` (Calculator, History, Nilai Persediaan sheets).

## Global Constraints

- UI elements must adhere to the existing dark theme and Bahasa Indonesia localization.
- All changes must maintain RBAC (Role-Based Access Control) and entity scoping (BBB/BBT/All).
- Feature changes must be committed and pushed to `origin/main` before Vercel production deployment.
- Calculations must use `catalog.unit_cost` (seeded in Phase 1) for Rupiah-denominated metrics.
- Lead Time (LT) per SKU must be stored in `catalog` table (new column `lead_time_days`).
- History data for forecasting sourced from existing `ledger` table (outbound transactions).

## Review Focus

1. **DOI / ROP Accuracy**: `DOI = current_qty / avg_daily_usage` must match Excel output for sample SKUs.
2. **Safety Stock Parameter Tuning**: Changing Safety Stock days per SKU/entity must immediately reflect in ROP and Saran Order.
3. **Forecast Validity**: Weighted moving average on last N months of outbound history must produce sensible forecasts.
4. **Entity Scoping**: All calculator outputs must respect BBB/BBT/ALL filter from `useEntity` hook.
5. **Dashboard Alert Prioritization**: KRITIS items (DOI < LT) must appear at top of alerts with red badges.

---

### Task 1: Database Schema Extension for Calculator Parameters

**Files:**
- Create: `supabase/migrations/20261127000000_calculator_params.sql`
- Modify: `src/lib/db.ts` (add `lead_time_days`, `safety_stock_days` to `CatalogEntry`)

**Interfaces:**
- Consumes: Existing `catalog` table, `CatalogEntry` interface.
- Produces: Updated `CatalogEntry` with `lead_time_days` (int), `safety_stock_days` (int, default 3).

- [ ] **Step 1: Write the failing test**
```typescript
// tests/lib/db.test.ts
import { getCatalog } from '@/lib/db';
test('catalog includes lead_time_days and safety_stock_days', async () => {
  const cat = await getCatalog();
  expect(cat[0]).toHaveProperty('leadTimeDays');
  expect(cat[0]).toHaveProperty('safetyStockDays');
});
```

- [ ] **Step 2: Run test to verify it fails**
Run: `npm test -- tests/lib/db.test.ts`
Expected: FAIL — properties undefined.

- [ ] **Step 3: Implement migration & update `db.ts`**
```sql
-- supabase/migrations/20261127000000_calculator_params.sql
ALTER TABLE catalog ADD COLUMN IF NOT EXISTS lead_time_days INT DEFAULT 3;
ALTER TABLE catalog ADD COLUMN IF NOT EXISTS safety_stock_days INT DEFAULT 3;
COMMENT ON COLUMN catalog.lead_time_days IS 'Lead time in days for this SKU (supplier delivery)';
COMMENT ON COLUMN catalog.safety_stock_days IS 'Safety stock buffer in days of demand';
```
Update `CatalogEntry` interface and `getCatalog()`/`getSKUByName()`/`getSKUById()` to include `leadTimeDays`, `safetyStockDays`.

- [ ] **Step 4: Run migration & tests**
Run: `SUPABASE_ACCESS_TOKEN=... npx supabase db push` (or apply via Management API), then `npm test`.
Expected: PASS.

- [ ] **Step 5: Commit**
```bash
git add supabase/migrations/20261127000000_calculator_params.sql src/lib/db.ts
git commit -m "feat: add lead_time_days & safety_stock_days to catalog"
```

---

### Task 2: Core Calculator Library (Pure TS)

**Files:**
- Create: `src/lib/inventory-calculator.ts`
- Test: `tests/lib/inventory-calculator.test.ts`

**Interfaces:**
- Consumes: `InventoryLot[]` (from `getInventoryLots()`), `CatalogEntry[]` (with `leadTimeDays`, `safetyStockDays`), `LedgerEntry[]` (for history).
- Produces: `CalculatorResult[]` — one row per SKU with computed metrics.

```typescript
// src/lib/inventory-calculator.ts
export interface CalculatorResult {
  skuName: string;
  entitas: 'BBB' | 'BBT';
  currentStock: number;        // sum of qty > 0 lots
  unitCost: number;
  avgDailyUsage: number;       // from last 30 days outbound ledger
  doi: number;                 // currentStock / avgDailyUsage (Infinity if no usage)
  leadTimeDays: number;
  safetyStockDays: number;
  coverageDays: number;        // doi - leadTimeDays
  status: 'KRITIS' | 'AMAN' | 'OVERSTOCK';
  safetyStockQty: number;      // avgDailyUsage * safetyStockDays
  ropQty: number;              // avgDailyUsage * leadTimeDays + safetyStockQty
  sarahOrderQty: number;       // max(0, ropQty - currentStock)
  inventoryValue: number;      // currentStock * unitCost
  forecast30d: number;         // weighted forecast next 30 days
  forecastPerDay: number;
  forecastStatus: 'OK' | 'LOW_DATA';
  forecastMethod: string;      // e.g. 'WMA-5m'
}
```

- [ ] **Step 1: Write failing unit tests** (covering: zero usage, normal, zero stock, negative coverage)
```typescript
// tests/lib/inventory-calculator.test.ts
import { calculateInventoryMetrics } from '@/lib/inventory-calculator';
test('DOI = Infinity when avgDailyUsage = 0', () => { ... });
test('KRITIS when doi < leadTime', () => { ... });
test('ROP = usage * LT + usage * safetyDays', () => { ... });
test('Saran Order = max(0, ROP - currentStock)', () => { ... });
```

- [ ] **Step 2: Run tests** → Expected: FAIL.

- [ ] **Step 3: Implement `calculateInventoryMetrics()`**
Algorithm (per Excel `Calculator` sheet):
1. Aggregate `currentStock` per SKU from `InventoryLot` (entity-filtered).
2. Compute `avgDailyUsage` from `ledger` outbound (negative `qty_in`) in last 30 days per SKU per entity.
3. `doi = avgDailyUsage > 0 ? currentStock / avgDailyUsage : Infinity`.
4. `coverageDays = doi - leadTimeDays`.
5. `status = coverageDays < 0 ? 'KRITIS' : coverageDays > leadTimeDays * 3 ? 'OVERSTOCK' : 'AMAN'`.
6. `safetyStockQty = avgDailyUsage * safetyStockDays`.
7. `ropQty = avgDailyUsage * leadTimeDays + safetyStockQty`.
8. `saranOrderQty = Math.max(0, ropQty - currentStock)`.
9. `forecast30d` = Weighted Moving Average of last 5 months outbound history (weights: most recent month ×5, ×4, ×3, ×2, ×1) × 30 days / sum of weights. (Excel uses: Mei..Nov monthly totals with coeffs).
10. `inventoryValue = currentStock * unitCost`.

- [ ] **Step 4: Run tests** → Expected: PASS.

- [ ] **Step 5: Commit**
```bash
git add src/lib/inventory-calculator.ts tests/lib/inventory-calculator.test.ts
git commit -m "feat: core inventory calculator library with DOI/ROP/forecast"
```

---

### Task 3: Calculator API Route (`/api/inventory/calculator`)

**Files:**
- Create: `src/app/api/inventory/calculator/route.ts`
- Test: `tests/api/inventory-calculator.test.ts` (integration test)

**Interfaces:**
- Consumes: `calculateInventoryMetrics()` from Task 2, `useEntity` filter via `ent` query param.
- Produces: JSON array of `CalculatorResult` filtered by entity.

- [ ] **Step 1: Write failing integration test**
```typescript
// tests/api/inventory-calculator.test.ts
test('GET /api/inventory/calculator?ent=BBB returns calculator rows for BBB', async () => { ... });
```

- [ ] **Step 2: Run test** → Expected: FAIL (route not found).

- [ ] **Step 3: Implement route**
```typescript
// src/app/api/inventory/calculator/route.ts
export const dynamic = 'force-dynamic';
import { calculateInventoryMetrics } from '@/lib/inventory-calculator';
import { getInventoryLots, getCatalog, getLedger, EntityFilter } from '@/lib/google-sheets';

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const entParam = searchParams.get('ent')?.toUpperCase();
  const entity: EntityFilter = ['BBB','BBT','ALL'].includes(entParam) ? entParam : 'BBB';
  
  const [lots, catalog, ledger] = await Promise.all([
    getInventoryLots(),
    getCatalog(),
    getLedger(),
  ]);
  
  const results = calculateInventoryMetrics({ lots, catalog, ledger, entity });
  return NextResponse.json(results);
}
```

- [ ] **Step 4: Run test** → Expected: PASS.

- [ ] **Step 5: Commit**
```bash
git add src/app/api/inventory/calculator/route.ts
git commit -m "feat: inventory calculator API endpoint"
```

---

### Task 4: Dashboard Integration — Calculator Alerts & KPIs

**Files:**
- Modify: `src/lib/db.ts` (add `getCalculatorSummary(entity)` returning aggregate counts)
- Modify: `src/app/api/dashboard/route.ts` (include calculator alerts)
- Modify: `src/app/page.tsx` (Dashboard UI: KRITIS/AMAN/OVERSTOCK summary cards, top KRITIS table)

**Interfaces:**
- Consumes: `/api/inventory/calculator` or direct `calculateInventoryMetrics()` call.
- Produces: Dashboard summary metrics + alert list.

- [ ] **Step 1: Write failing tests** for `getCalculatorSummary` and dashboard API response shape.

- [ ] **Step 2: Implement `getCalculatorSummary(entity)` in `db.ts`**
```typescript
export async function getCalculatorSummary(entity?: EntityFilter) {
  const metrics = await calculateInventoryMetrics({ ... });
  return {
    kritisCount: metrics.filter(m => m.status === 'KRITIS').length,
    amanCount: metrics.filter(m => m.status === 'AMAN').length,
    overstockCount: metrics.filter(m => m.status === 'OVERSTOCK').length,
    totalInventoryValue: metrics.reduce((s,m) => s + m.inventoryValue, 0),
    totalSaranOrderValue: metrics.reduce((s,m) => s + m.saranOrderQty * m.unitCost, 0),
    topKritis: metrics.filter(m => m.status === 'KRITIS')
      .sort((a,b) => a.coverageDays - b.coverageDays)
      .slice(0, 10)
      .map(m => ({ skuName: m.skuName, doi: m.doi.toFixed(1), coverageDays: m.coverageDays.toFixed(1), entitas: m.entitas })),
  };
}
```

- [ ] **Step 3: Update `/api/dashboard/route.ts`** to include `calculatorSummary` in response.

- [ ] **Step 4: Update `src/app/page.tsx`** — Add 4 summary cards (KRITIS, AMAN, OVERSTOCK, Total Inventory Value Rp) + expandable "Top 10 KRITIS Items" table with links to Opname.

- [ ] **Step 5: Run tests & verify UI** → Expected: PASS, Dashboard shows live calculator alerts.

- [ ] **Step 6: Commit**
```bash
git add src/lib/db.ts src/app/api/dashboard/route.ts src/app/page.tsx
git commit -m "feat: dashboard calculator alerts & KRITIS summary"
```

---

### Task 5: Admin Settings Page — Calculator Parameters UI

**Files:**
- Create: `src/app/calculator-settings/page.tsx` (protected: Manager/Super Admin only)
- Modify: `src/components/common/NavBar.tsx` (add "Pengaturan Kalkulator" link for Manager/Super Admin)
- Create: `src/app/api/calculator-settings/route.ts` (GET list, PUT update per SKU)

**Interfaces:**
- Consumes: `CatalogEntry` with `lead_time_days`, `safety_stock_days`.
- Produces: Editable table per SKU: Lead Time (days), Safety Stock (days), with Save button.

- [ ] **Step 1: Write failing tests** for settings API and page rendering (mocked auth).

- [ ] **Step 2: Implement `/api/calculator-settings` route** (GET all catalog with params, PUT batch update).

- [ ] **Step 3: Implement `src/app/calculator-settings/page.tsx`** — Table with columns: SKU, Entitas, Lead Time, Safety Stock, Current Stock, ROP, Saran Order. Inline edit with debounced save.

- [ ] **Step 4: Update `NavBar.tsx`** — Add link visible to `manager` and `super-admin`.

- [ ] **Step 5: Commit**
```bash
git add src/app/calculator-settings src/app/api/calculator-settings src/components/common/NavBar.tsx
git commit -m "feat: calculator settings UI for Lead Time & Safety Stock"
```

---

### Task 6: Demand Forecasting from History

**Files:**
- Modify: `src/lib/inventory-calculator.ts` (enhance `forecast30d` logic)
- Create: `src/lib/forecast.ts` (separate module for forecast algorithms)

**Interfaces:**
- Consumes: `LedgerEntry[]` outbound history (last 12 months), grouped by month per SKU per entity.
- Produces: `forecast30d`, `forecastPerDay`, `forecastStatus`, `forecastMethod` in `CalculatorResult`.

Algorithm (per Excel `History` + `Calculator` sheets):
- Extract monthly outbound totals per SKU per entity from `ledger` (negative `qty_in`).
- Use last 5 months with data: weights 5,4,3,2,1 (most recent = 5).
- `forecastPerDay = sum(monthly_qty * weight) / sum(weights) / 30`.
- `forecast30d = forecastPerDay * 30`.
- If < 3 months data → `forecastStatus = 'LOW_DATA'`, fallback to simple average.

- [ ] **Step 1: Write failing unit tests** for `calculateForecast(monthlyHistory: number[])`.

- [ ] **Step 2: Implement `calculateForecast()` in `src/lib/forecast.ts`**.

- [ ] **Step 3: Integrate into `calculateInventoryMetrics()`** — replace placeholder forecast logic.

- [ ] **Step 4: Run tests** → Expected: PASS.

- [ ] **Step 5: Commit**
```bash
git add src/lib/forecast.ts src/lib/inventory-calculator.ts
git commit -m "feat: weighted moving average demand forecast from ledger history"
```

---

### Task 7: Inventory Calculator Page (Full View)

**Files:**
- Create: `src/app/calculator/page.tsx` (Manager/Super Admin only)
- Modify: `NavBar.tsx` (add "Kalkulator Persediaan" link)

**Interfaces:**
- Consumes: `/api/inventory/calculator` data.
- Produces: Full-screen table with all calculator columns, sortable, filterable, export to Excel.

Columns: Entitas, SKU, Stok Saat Ini, Harga Satuan, Nilai Persediaan, Pemakaian Harian, DOI, LT, Safety Stock, Coverage, Status, ROP, Saran Order, Forecast 30d, Forecast/Hari.

- [ ] **Step 1: Write failing integration test** (page renders with mocked data).

- [ ] **Step 2: Implement page** using `Table` + `Input` for inline Safety Stock / Lead Time editing (delegates to settings API).

- [ ] **Step 3: Add Excel export button** (re-use `xlsx` pattern from outbound export).

- [ ] **Step 4: Commit**
```bash
git add src/app/calculator src/components/common/NavBar.tsx
git commit -m "feat: full inventory calculator page with Excel export"
```

---

## Execution Handoff

Plan complete and saved to `docs/superpowers/plans/2026-11-27-inventory-calculator-auto-rop.md`. 

**Please review the plan. Which execution approach would you prefer?**

- **Subagent-driven** — A fresh subagent implements each task and a fresh reviewer checks it before the next one starts, then a whole-branch review at the end. Most thorough; costs a fresh context per task and per review.
- **Native** — I implement every task myself in this session, the way this harness runs work, then one fresh reviewer on the most capable model checks the whole branch. Cheapest and fastest; no independent review until the end. Runs well with a mid-tier session model, since the plan carries the design.

**For this plan I recommend Subagent-driven**, because the tasks involve distinct layers (DB migration → pure logic library → API → Dashboard UI → Admin Settings → Forecast module → Full Page) that benefit from focused reviews at each step and have clear interface boundaries defined in the plan. Does the plan capture what you want, and which approach should we use?