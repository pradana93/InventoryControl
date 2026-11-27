# Phase 4 — SKU Lifecycle & Intelligent Slotting (Unified) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a unified **Warehouse Optimization** module (`/warehouse-optimization`) that (1) lets managers formally activate/deactivate/archive SKUs and instantly propagates that lifecycle state across all views, and (2) computes ABC classification and optimal zone/rack slotting recommendations for active SKUs, producing an exportable move list for the warehouse team.

**Architecture:** New page `/warehouse-optimization` with two tabs (SKU Lifecycle Manager + Slotting Optimizer). Core logic lives in `src/lib/warehouse-optimization.ts` (pure, testable) that reads `catalog`, `ledger`, and `stock_opname` from existing Supabase tables — no new schema. Lifecycle state (`activeFlag`) stored in `catalog` as a new boolean column (or `status` enum). Slotting computed from outbound velocity on active SKUs only.

**Tech Stack:** Next.js 16, React, TypeScript, Tailwind CSS, shadcn/ui, `xlsx`, lucide-react, date-fns.

**Spec:** This unified plan merges SKU Lifecycle Management (Approach A) and ABC Slotting (Approach B) from Phase 4 brainstorming.

## Global Constraints

- Dark theme, Bahasa Indonesia localization throughout.
- Role-based access: Super Admin and Manager can activate/deactivate/archive SKUs and run slotting; Operator sees read-only.
- Entity scoping (BBB/BBT/ALL) respected everywhere via `useEntity` hook.
- Must reuse existing data (`calculateInventoryMetrics()`, `getInventoryLots()`, `getLedger()`, `getCatalog()`) — no new Supabase tables; only add `activeFlag: boolean` column to `catalog` via migration.
- All date logic uses `date-fns`; classifications use 90-day windows for A/B/C split.
- Production build must pass `npx next build`.

## Review Focus

1. **Lifecycle Propagation**: Inactive SKUs must be hidden/have grayed UI across Calculator, Replenishment, Opname, Picking Lists, Reports automatically when `activeFlag` is toggled.
2. **Slotting Validity**: ABC classification must exactly match last 90 days of outbound volume per SKU (A = top 80% volume, B = next 15%, C = bottom 5%).
3. **Archive Consistency**: Archived SKUs still visible in Lifecycle tab but auto-filtered out of Slotting Optimizer; their physical stock flagged for reconciliation.
4. **Entity Isolation**: Switching entity in NavBar re-filters both tabs without page reload.
5. **Export Consistency**: Excel files must include entity filter state, export timestamp, and column headers in Bahasa Indonesia.

---
### Task 1: Add `activeFlag` Column to `catalog` & Migration

**Files:**
- Create: `supabase/migrations/20261128000000_add_active_flag_to_catalog.sql`
- Modify: `src/lib/db.ts` — add `activeFlag` to `CatalogEntry` interface and mapping
- Modify: `scripts/seed-costs-sql.mjs` or seed logic if needed (not needed if default is true).

**Interfaces:**
- Consumes: Existing `catalog` table.
- Produces: `catalog` now has `activeFlag: boolean` column with default `true`.

```sql
-- supabase/migrations/20261128000000_add_active_flag_to_catalog.sql
ALTER TABLE catalog ADD COLUMN IF NOT EXISTS activeFlag BOOLEAN DEFAULT true;
COMMENT ON COLUMN catalog.activeFlag IS 'True = SKU is active and visible in operational views; False = SKU is archived/inactive';
```

- [ ] **Step 1: Write the failing test** (`tests/lib/db.test.ts` or new file) — verify `getCatalog()` returns `activeFlag` as boolean with default `true`.
- [ ] **Step 2: Run test** → Expected: FAIL (column not yet added).
- [ ] **Step 3: Run migration** via Supabase Management API or `npx supabase db push`.
- [ ] **Step 4: Run test** → Expected: PASS.
- [ ] **Step 5: Update `CatalogEntry` interface** in `src/lib/db.ts` with `activeFlag: boolean`.
- [ ] **Step 6: Run `npx tsc --noEmit`** → Expected: PASS.
- [ ] **Step 7: Commit**  
  `git add supabase/migrations/20261128000000_add_active_flag_to_catalog.sql src/lib/db.ts`  
  `git commit -m "feat: add activeFlag column to catalog"`

---

### Task 2: SKU Lifecycle Manager Tab (`/warehouse-optimization` Tab 1)

**Files:**
- Create: `src/app/warehouse-optimization/sku-lifecycle/SkuLifecycleClient.tsx`
- Create: `src/app/warehouse-optimization/page.tsx`
- Modify: `src/components/common/NavBar.tsx` (add nav item)

**Interfaces:**
- Consumes: `getCatalog()` from `db.ts`; `useEntity` hook.
- Produces: Lifecycle table + bulk action UI.

```typescript
interface SkuLifecycleItem {
  skuId: string;
  namaBarang: string;
  entitas: 'BBB' | 'BBT';
  activeFlag: boolean;
  currentStock: number;
  unitCost: number;
  inventoryValue: number;
  lastOpname: string | 'Tidak Ada';
}
```

- [ ] **Step 1: Write the failing test** (`tests/app/sku-lifecycle.test.ts`)
```typescript
import { toggleSkuActiveFlag } from '@/app/warehouse-optimization/sku-lifecycle/SkuLifecycleClient';
test('toggle inactive SKU becomes active', () => { ... });
```
- [ ] **Step 2: Run test** → Expected: FAIL.

- [ ] **Step 3: Implement `SkuLifecycleClient.tsx`**
  - Fetch `/api/catalog` (extend existing catalog API to include `activeFlag`).
  - Table with columns: SKU ID, Nama Barang, Entitas, Stok Saat Ini, Nilai Persediaan, Aktif, Aksi.
  - **Aksi**: Toggle Switch (ON/OFF). When toggled, `PUT /api/catalog/{skuId}/active` with `{ activeFlag }`.
  - Bulk toggle: Select multiple rows → "Aktifkan Terpilih" / "Nonaktifkan Terpilih".
  - Inactive SKUs get a badge `Nonaktif` (gray) and a "Pulihkan" (Restore) button.
  - Archived SKUs (activeFlag = false, but also a conceptual state) get "Arsip" badge and "Balikkan ke Raktam" button.
  - Dark theme, Bahasa Indonesia, `useSession` auth guard (Super Admin/Manager can toggle; Operator sees read-only).

- [ ] **Step 4: Implement `page.tsx`** with `dynamic` import `ssr: false` + `<Suspense>`.

- [ ] **Step 5: Add nav item to `NavBar.tsx`**:
  ```tsx
  { href: '/warehouse-optimization', icon: LayoutDashboard, label: 'Optimalisasi Gudang', roles: ['super-admin', 'manager'] }
  ```

- [ ] **Step 6: Run tests + `npx tsc --noEmit`** → Expected: PASS.

- [ ] **Step 7: Commit**  
  `git add src/app/warehouse-optimization src/components/common/NavBar.tsx tests/app/sku-lifecycle.test.ts`  
  `git commit -m "feat: SKU lifecycle manager tab"`

---

### Task 3: Slotting Optimizer Tab (`/warehouse-optimization` Tab 2)

**Files:**
- Create: `src/app/warehouse-optimization/slotting/SslottingClient.tsx`
- Create: (page.tsx already contains both tabs; just the slotting component)

**Interfaces:**
- Consumes: Active SKUs only (filter from Task 1's `activeFlag`; `getInventoryLots()`, `getLedger()`).
- Produces: Slotting recommendation table.

```typescript
interface SlottingRecommendation {
  skuName: string;
  entitas: 'BBB' | 'BBT';
  classification: 'A' | 'B' | 'C';
  currentRak: string | '—';
  recommendedRak: string;
  priorityScore: number; // 1 = move immediately, higher = lower priority
  daysSinceLastOutbound: number | 'N/A';
}
```

- [ ] **Step 1: Write the failing test** (`tests/app/slotting.test.ts`)
```typescript
import { computeAbcClassification, computeSlottingRecommendations } from '@/app/warehouse-optimization/slotting/SslottingClient';
test('classifies SKU A when top 80% volume', () => { ... });
```
- [ ] **Step 2: Run test** → Expected: FAIL.

- [ ] **Step 3: Implement `SslottingClient.tsx`**
  - Pure functions:
    - `computeAbcClassification(ledgerEntries: LedgerEntry[]): { skuName: string; classification: 'A'|'B'|'C'; volume: number }[]`
    - `computeSlottingRecommendations(activeSkus: SkuLifecycleItem[], classifications: ...): SlottingRecommendation[]`
  - Classification logic (last 90 days of outbound from ledger):
    - Group by SKU, sum `abs(qty_in)` where `qty_in < 0` (outbound).
    - Sort descending by volume.
    - Top `ceil(totalVolume * 0.20)` → wait, let's do: total volume * 0.80 goes to A, next 0.15 → B, remaining → C. Actually standard ABC: A = top 80% of value/volume, B = next 15%, C = bottom 5%.
    - Actually simpler: sort all SKUs by volume descending, compute cumulative %; first group where cumulative <= 80% → A, next <= 15% → B, rest → C.
  - Slotting recommendations:
    - A → Recommend `RAK-LOWER` zone (prime pick floor), priorityScore = 1.
    - B → Recommend `RAK-MID` zone, priorityScore = 2.
    - C → Recommend `RAK-UPPER` zone, priorityScore = 3.
    - If SKU has `currentRak` already, show delta.
    - `daysSinceLastOutbound`: from latest ledger entry `created_at` for that SKU, or 'Tidak Ada'.
  - Table columns: SKU, Entitas, Klasifikasi, Stok Saat Ini, Volumetil 90 Hari, Rak Saat Ini, Saran Rak, Prioritas, Last Keluar.
  - "Export Slotting Move List" → workbook with sheet of SKU, Current Rak, Saran Rak, Prioritas.
  - Auth guard: Super Admin/Manager only.

- [ ] **Step 4: No separate page needed** — the `/warehouse-optimization/page.tsx` already renders two tabs; the SlottingClient is the second tab.

- [ ] **Step 5: Run tests + `npx tsc --noEmit`** → Expected: PASS.

- [ ] **Step 6: Commit**  
  `git add src/app/warehouse-optimization/slotting src/app/warehouse-optimization/sku-lifecycle ...`  
  `git commit -m "feat: slotting optimizer tab for warehouse"`

---

### Task 4: Dashboard & Cross-Page Propagation of Lifecycle State

**Files:**
- Modify: `src/app/opname/page.tsx` — filter out inactive SKUs from `getInventoryLots()` results or add `activeFlag` check.
- Modify: `src/app/calculator/page.tsx` — same filter.
- Modify: `src/app/replenishment/ReplenishmentClient.tsx` — same filter (already filters by `saranOrderQty > 0 || status === 'KRITIS'`; add `&& activeFlag`).
- Modify: `src/app/reports/ReportsClient.tsx` — same filter for valuation/slow-moving/velocity.
- Modify: `src/app/outbound/page.tsx` — same.

Actually, a **shared utility** is cleaner: add a helper function `filterActiveSkus(items)` in `src/lib/warehouse-optimization.ts` that all pages can import. Then each page just adds `&& item.activeFlag` to their existing fetch/filters.

- [ ] **Step 1: Write the failing test** for the shared `filterActiveSkus` utility in `tests/lib/warehouse-optimization.test.ts`.
- [ ] **Step 2: Implement `src/lib/warehouse-optimization.ts`** with `filterActiveSkus()`.
- [ ] **Step 3: Update all consuming pages** to import and use it.
- [ ] **Step 3: Run tests + `npx tsc --noEmit`** → Expected: PASS.
- [ ] **Step 4: Commit**  
  `git add src/lib/warehouse-optimization.ts tests/lib/warehouse-optimization.test.ts`  
  `git commit -m "feat: shared active SKU filter utility"`

---

### Task 5: Build Verification & Push

**Files:** none (verification only)

- [ ] **Step 1: Run `npx next build`** locally — ensure both new routes `/warehouse-optimization` render.
- [ ] **Step 2: Run all test suites** (`npx tsx tests/app/...`, `npx tsx tests/lib/...`).
- [ ] **Step 2: Push to `origin/main`** → `git push origin main`.
- [ ] **Step 3: Verify Vercel deployment** — check `/warehouse-optimization` renders and toggles work.

---

## Execution Handoff

Plan complete and saved to `docs/superpowers/plans/2026-11-27-warehouse-optimization-sku-lifecycle-and-slotting.md`.

**Please review the plan. Which execution approach would you prefer?**

- **Subagent-driven** — A fresh subagent implements each task and a fresh reviewer checks it before the next one starts, then a whole-branch review at the end. Most thorough; costs a fresh context per task and per review.
- **Native** — I implement every task myself in this session, the way this harness runs work, then one fresh reviewer on the most capable model checks the whole branch. Cheapest and fastest; no independent review until the end. Runs well with a mid-tier session model, since the plan carries the design.

**For this plan I recommend Subagent-driven**, because the tasks involve distinct UI pages, an API migration, and a shared utility that must stay consistent across 5+ existing pages. Focused reviews at each step ensure the lifecycle state truly propagates everywhere without bugs. Does the plan capture what you want, and which approach should we use?