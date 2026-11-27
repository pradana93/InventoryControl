# Phase 3 — Replenishment Action Center & Inventory Reporting Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a dedicated "Eyes in the Skies" Replenishment Action Center and Inventory Reporting module that gives the warehouse team real-time visibility into SKUs dropping below ROP and provides leadership with stock health reports (valuation, slow-moving, velocity) to maintain stock levels amid fluctuating daily distribution.

**Architecture:** New pages `/replenishment` and `/reports` built as client components with `ssr: false` + `<Suspense>` wrapper (pattern from Phase 2). Core data is reused from `calculateInventoryMetrics()` and ledger history. No new database schema needed — all metrics are computed from existing `ledger`, `catalog`, and `stock_opname`.

**Tech Stack:** Next.js 16, React, TypeScript, Tailwind CSS, shadcn/ui, `xlsx` for exports, lucide-react icons.

**Spec:** Derived from brainstorming outcome — "Approach B: Replenishment Action Center & Reporting" — see `docs/superpowers/specs/2026-11-26-opname-fefo-enforcement-design.md` (Phase 3 section) and this plan.

## Global Constraints

- Dark theme, Bahasa Indonesia localization throughout.
- Role-based access: **Super Admin / Manager** see everything; **Operator** sees Replenishment Action Center only (read-only).
- Entity scoping (BBB/BBT/ALL) respected everywhere via `useEntity` hook.
- Must reuse existing `calculateInventoryMetrics()` and `getCalculatorSummary()` from `src/lib/db.ts` — no duplicate calculation logic.
- All date logic uses `date-fns`; currency uses `toLocaleString('id-ID')`.
- Production build must pass `npx next build` with static export for the new pages (wrap in `ssr:false` + `<Suspense>`).

## Review Focus

1. **Replenishment Accuracy**: The "Below ROP" list must exactly match `saranOrderQty > 0` from the calculator for the selected entity.
2. **Report Valuation Correctness**: Total stock value = `sum(currentStock * unitCost)` must reconcile with Dashboard `totalInventoryValue`.
3. **Slow-Moving Definition**: SKUs with `avgDailyUsage === 0` AND `currentStock > 0` flagged as dead stock; last movement date taken from latest `ledger` entry.
4. **Entity Filter Isolation**: Switching entity in the NavBar must immediately re-filter both pages without page reload.
5. **Export Consistency**: Excel files must include entity filter state, export timestamp, and column headers in Bahasa Indonesia.

---

### Task 1: Replenishment Action Center Page (`/replenishment`)

**Files:**
- Create: `src/app/replenishment/ReplenishmentClient.tsx`
- Create: `src/app/replenishment/page.tsx`
- Modify: `src/components/common/NavBar.tsx` (add nav item)

**Interfaces:**
- Consumes: `calculateInventoryMetrics()` output via `/api/inventory/calculator`; `useEntity` hook for filter.
- Produces: Client-side filtered array of `ReplenishmentItem` (subset of `CalculatorResult` where `saranOrderQty > 0` or `status === 'KRITIS'`).

```typescript
// ReplenishmentItem is a projection of CalculatorResult
interface ReplenishmentItem {
  skuName: string;
  entitas: 'BBB' | 'BBT';
  currentStock: number;
  unitCost: number;
  avgDailyUsage: number;
  doi: number;
  status: 'KRITIS' | 'AMAN' | 'OVERSTOCK';
  ropQty: number;
  saranOrderQty: number;
  inventoryValue: number;
  forecast30d: number;
  priority: 'URGENT' | 'HIGH' | 'NORMAL'; // derived: KRITIS + low DOI = URGENT
}
```

- [ ] **Step 1: Write the failing test** (`tests/app/replenishment.test.ts`)
```typescript
import { filterReplenishmentItems } from '@/app/replenishment/ReplenishmentClient';
test('only KRITIS and saranOrderQty > 0 items appear', () => {
  const mockData = [...]; // 1 KRITIS, 1 AMAN with saranOrder, 1 AMAN no saranOrder
  const result = filterReplenishmentItems(mockData);
  expect(result.length).toBe(2);
});
```

- [ ] **Step 2: Run test** → Expected: FAIL (module not found).

- [ ] **Step 3: Implement `ReplenishmentClient.tsx`**
  - Fetch `/api/inventory/calculator?ent=<entity>` with `useEntity`.
  - Filter: `status === 'KRITIS' || saranOrderQty > 0`.
  - Compute `priority`: `status === 'KRITIS' && doi < 1 ? 'URGENT' : status === 'KRITIS' ? 'HIGH' : 'NORMAL'`.
  - Sort: `priority` (URGENT→HIGH→NORMAL), then `saranOrderQty * unitCost` descending.
  - Table columns: Entitas, SKU, Stok, Harga, ROP, Saran Order, DOI, Status, Prioritas, Nilai Saran (Rp).
  - Color badges: URGENT=red, HIGH=amber, NORMAL=blue.
  - "Export Excel" button → `Replenishment-Priority-YYYY-MM-DD.xlsx`.

- [ ] **Step 4: Implement `page.tsx`** with `dynamic` import `ssr:false` + `<Suspense>`.

- [ ] **Step 5: Add nav item to `NavBar.tsx`** — icon `AlertTriangle`, label `Pusat Tindakan`, roles: all three.

- [ ] **Step 6: Run test + `npx tsc --noEmit`** → Expected: PASS.

- [ ] **Step 7: Commit**  
  `git add src/app/replenishment src/components/common/NavBar.tsx`  
  `git commit -m "feat: replenishment action center page"`

---

### Task 2: Inventory Reports Page (`/reports`)

**Files:**
- Create: `src/app/reports/ReportsClient.tsx`
- Create: `src/app/reports/page.tsx`
- Modify: `src/components/common/NavBar.tsx` (add nav item)

**Interfaces:**
- Consumes: `getInventoryLots()`, `getCatalog()`, `getLedger()` via a new API `/api/inventory/report`; `useEntity` hook.
- Produces: Three report tabs, each exporting an Excel sheet.

```typescript
// /api/inventory/report response
interface InventoryReportData {
  valuation: Array<{ category: string; skuCount: number; totalQty: number; totalValue: number; entity: 'BBB'|'BBT' }>;
  slowMoving: Array<{ skuName: string; entitas: 'BBB'|'BBT'; currentStock: number; unitCost: number; inventoryValue: number; lastMovement: string | 'Tidak Ada'; daysSinceMovement: number | 'N/A' }>;
  velocity: Array<{ skuName: string; entitas: 'BBB'|'BBT'; avgDailyUsage: number; currentStock: number; daysOfCover: number; trend: 'UP'|'DOWN'|'FLAT' }>; // trend = last 7d vs prior 7d
}
```

- [ ] **Step 1: Write the failing test** (`tests/app/reports.test.ts`)
```typescript
import { computeValuation, computeSlowMoving, computeVelocity } from '@/app/reports/ReportsClient';
test('valuation groups by category and entity', () => { ... });
test('slow-moving flags zero-usage SKUs with stock', () => { ... });
test('velocity calculates trend from 7d windows', () => { ... });
```

- [ ] **Step 2: Run test** → Expected: FAIL.

- [ ] **Step 3: Create API route `src/app/api/inventory/report/route.ts`**
  - `GET` accepts `ent` query param.
  - Fetches `lots`, `catalog`, `ledger` from `db.ts`.
  - Delegates to pure functions in `ReportsClient.tsx` (or a new `src/lib/inventory-reports.ts`) for testability.
  - Returns `InventoryReportData`.

- [ ] **Step 4: Implement `ReportsClient.tsx`**
  - Three tabs: **Valuasi Stok**, **Slow Moving / Dead Stock**, **Distribusi & Velocity**.
  - Tab 1 (Valuasi): Group by category+entity, show SKU count, total qty, total value (Rp). Expandable per-SKU rows.
  - Tab 2 (Slow Moving): Items with `avgDailyUsage === 0 && currentStock > 0`. Show last movement date (from `ledger` max date per SKU) and days since. Highlight `daysSinceMovement > 60` as dead stock.
  - Tab 3 (Velocity): `daysOfCover = currentStock / avgDailyUsage`. Trend: compare sum of last 7 days outbound vs prior 7 days.
  - Each tab has its own "Export Excel" → single workbook with 3 sheets named by tab.

- [ ] **Step 5: Implement `page.tsx`** with `dynamic` import `ssr:false` + `<Suspense>`.

- [ ] **Step 6: Add nav item to `NavBar.tsx`** — icon `BarChart2`, label `Laporan Persediaan`, roles: `super-admin`, `manager`.

- [ ] **Step 7: Run tests + `npx tsc --noEmit`** → Expected: PASS.

- [ ] **Step 8: Commit**  
  `git add src/app/reports src/app/api/inventory/report src/components/common/NavBar.tsx`  
  `git commit -m "feat: inventory reports page with valuation, slow-moving, velocity"`

---

### Task 3: Dashboard Quick-Action Refinements

**Files:**
- Modify: `src/components/dashboard/DashboardView.tsx`

**Interfaces:**
- Consumes: existing `calculatorSummary` prop.
- Produces: inline links/buttons from KRITIS summary cards to `/replenishment` with pre-filtered entity.

- [ ] **Step 1: Write failing test** — ensure "Lihat Detail" button on KRITIS card navigates to `/replenishment` with current entity.

- [ ] **Step 2: Add clickable "Lihat Tindakan" link** on the "Items KRITIS" summary card and on the Top 10 KRITIS table rows.
  - Use `useRouter` or `Link` with `href="/replenishment"` (entity persists via URL `?ent=...` from NavBar).

- [ ] **Step 3: Run test + `npx tsc --noEmit`** → Expected: PASS.

- [ ] **Step 4: Commit**  
  `git add src/components/dashboard/DashboardView.tsx`  
  `git commit -m "feat: dashboard quick links to replenishment action center"`

---

### Task 4: Pre-flight Build Verification & Push

**Files:** none (verification only)

- [ ] **Step 1: Run `npx next build`** locally — ensure static export succeeds for `/replenishment` and `/reports`.

- [ ] **Step 2: Run all tests** (`npx tsx tests/app/replenishment.test.ts`, `npx tsx tests/app/reports.test.ts`).

- [ ] **Step 3: Push to `origin/main`** → `git push origin main`.

- [ ] **Step 4: Verify Vercel deployment** — check `https://inventory-control-six-mu.vercel.app/replenishment` and `/reports` render.

---

## Execution Handoff

Plan complete and saved to `docs/superpowers/plans/2026-11-27-replenishment-action-center-reporting.md`.

**Please review the plan. Which execution approach would you prefer?**

- **Subagent-driven** — A fresh subagent implements each task and a fresh reviewer checks it before the next one starts, then a whole-branch review at the end. Most thorough; costs a fresh context per task and per review.
- **Native** — I implement every task myself in this session, the way this harness runs work, then one fresh reviewer on the most capable model checks the whole branch. Cheapest and fastest; no independent review until the end. Runs well with a mid-tier session model, since the plan carries the design.

**For this plan I recommend Subagent-driven**, because the tasks involve distinct pages/APIs (Action Center → Reports API → Dashboard refinement) with clear interface boundaries and shared data dependencies that benefit from focused reviews at each step. Does the plan capture what you want, and which approach should we use?