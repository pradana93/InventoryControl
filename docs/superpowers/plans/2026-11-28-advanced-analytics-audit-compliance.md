# Phase 5: Advanced Analytics & Audit Trails Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build advanced analytics (Exponential Smoothing/ARIMA-inspired demand forecasting, Inventory Performance Dashboard tracking DOS/DOI, Turnover, and Carrying Costs) and an immutable audit trail with SOX compliance reconciliation and reporting.

**Architecture:** New database tables for immutable audit logs (`audit_logs`) and analytics snapshots. New pure libraries `src/lib/forecasting.ts`, `src/lib/audit.ts`, and `src/lib/compliance.ts`. New pages `/analytics` and `/audit` with client-side components, dark theme, and role-based access.

**Tech Stack:** Next.js 16, React, TypeScript, Tailwind CSS, shadcn/ui, `xlsx`, `lucide-react`, date-fns.

**Spec:** Derived from brainstorming outcome — "Advanced Analytics & Audit & Compliance" — covering enhanced DOS/DOI forecasting, performance metrics, immutable audit logs, and SOX reconciliation.

## Global Constraints

- Dark theme, Bahasa Indonesia localization throughout.
- Role-based access: Super Admin and Manager have full access; Operator has read-only or no access to audit/compliance.
- Entity scoping (BBB/BBT/ALL) respected everywhere via `useEntity` hook.
- Must reuse existing `db.ts` functions (`getInventoryLots()`, `getCatalog()`, `getLedger()`).
- All date logic uses `date-fns`; currency uses `toLocaleString('id-ID')`.
- Production build must pass `npx next build`.

## Review Focus

1. **Audit Mutability**: Audit logs must be insert-only; no UPDATE or DELETE policies on `audit_logs` table.
2. **DOS/DOI Accuracy**: Days of Supply calculation must handle zero outbound usage gracefully without infinite or NaN errors.
3. **SOX Reconciliation**: Valuation reconciliation must verify `sum(lots.qty * unit_cost)` matches ledger state.
4. **Entity Isolation**: Switching entity in the NavBar must immediately re-filter analytics and audit tables.
5. **Export Consistency**: Excel exports must include export timestamp, entity scope, and Bahasa Indonesia headers.

---

### Task 1: Immutable Audit Log Schema & Helper

**Files:**
- Create: `supabase/migrations/20261129000000_audit_logs.sql`
- Create: `src/lib/audit.ts`
- Test: `tests/lib/audit.test.ts`

**Interfaces:**
- Produces: `logAuditAction({ userId, action, entity, recordId, oldValues, newValues })`, `getAuditLogs()`

```sql
CREATE TABLE IF NOT EXISTS audit_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  timestamp TIMESTAMPTZ DEFAULT now(),
  user_email TEXT NOT NULL,
  action TEXT NOT NULL, -- INSERT, UPDATE, DELETE, OPNAME, CONFIRM, TOGGLE
  table_name TEXT NOT NULL,
  record_id TEXT,
  old_values JSONB,
  new_values JSONB
);

-- Row Level Security: Insert only for authenticated, Read for admin/manager
ALTER TABLE audit_logs ENABLE ROW LEVEL SECURITY;
```

- [ ] **Step 1: Write the failing test** (`tests/lib/audit.test.ts`)
```typescript
import { logAuditAction, getAuditLogs } from '@/lib/audit';
test('audit log records action and retrieves correctly', async () => { ... });
```
- [ ] **Step 2: Run test** → FAIL.
- [ ] **Step 3: Apply migration and implement `src/lib/audit.ts`**.
- [ ] **Step 4: Run test** → PASS.
- [ ] **Step 5: Commit**  
  `git add supabase/migrations/20261129000000_audit_logs.sql src/lib/audit.ts tests/lib/audit.test.ts`  
  `git commit -m \"feat: immutable audit log schema and helper\"`

-- ---------------

### Task 2: Advanced Forecasting Engine (Exponential Smoothing & DOS)

**Files:**
- Create: `src/lib/forecasting.ts`
- Test: `tests/lib/forecasting.test.ts`

**Interfaces:**
- Consumes: Ledger history.
- Produces: `calculateExponentialSmoothingForecast(ledgerEntries, alpha)`, `calculateDaysOfSupply(currentStock, forecastDaily)`

- [ ] **Step 1: Write failing test** (`tests/lib/forecasting.test.ts`)
```typescript
import { calculateExponentialSmoothingForecast, calculateDaysOfSupply } from '@/lib/forecasting';
test('exponential smoothing weights recent history', () => { ... });
test('DOS calculates days correctly without division by zero', () => { ... });
```
- [ ] **Step 2: Run test** → FAIL.
- [ ] **Step 3: Implement `src/lib/forecasting.ts`**.
- [ ] **Step 4: Run test** → PASS.
- [ ] **Step 5: Commit**  
  `git add src/lib/forecasting.ts tests/lib/forecasting.test.ts`  
  `git commit -m \"feat: exponential smoothing forecast and DOS calculation engine\"`

-- ---------------

### Task 3: Advanced Analytics Dashboard (`/analytics`)

**Files:**
- Create: `src/app/api/analytics/route.ts`
- Create: `src/app/analytics/AnalyticsClient.tsx`
- Create: `src/app/analytics/page.tsx`
- Modify: `src/components/common/NavBar.tsx`

**Interfaces:**
- Consumes: `calculateExponentialSmoothingForecast`, `getInventoryLots()`, `getCatalog()`, `getLedger()`.
- Produces: `/analytics` page with DOS metrics, turnover ratio, carrying costs, forecast charts, and Excel export.

- [ ] **Step 1: Write failing test** (`tests/app/analytics.test.ts`)
- [ ] **Step 2: Implement API route `src/app/api/analytics/route.ts`**.
- [ ] **Step 3: Implement `AnalyticsClient.tsx` and `page.tsx`**.
- [ ] **Step 4: Add NavBar item** (Icon `TrendingUp`, Label `Analisis Lanjutan`, roles: super-admin, manager).
- [ ] **Step 5: Run tests + `npx tsc --noEmit`** → PASS.
- [ ] **Step 6: Commit**  
  `git add src/app/analytics src/app/api/analytics src/components/common/NavBar.tsx tests/app/analytics.test.ts`  
  `git commit -m \"feat: advanced analytics dashboard with DOS, turnover, and forecasting\"`

-- ---------------

### Task 4: SOX Compliance & Audit Log Viewer (`/audit`)

**Files:**
- Create: `src/app/api/audit/route.ts`
- Create: `src/app/api/compliance/sox/route.ts`
- Create: `src/app/audit/AuditClient.tsx`
- Create: `src/app/audit/page.tsx`
- Modify: `src/components/common/NavBar.tsx`

**Interfaces:**
- Consumes: `getAuditLogs()`, `getInventoryLots()`, `getCatalog()`.
- Produces: `/audit` page with Audit Trail Viewer and SOX Valuation Reconciliation Report (Book Value vs Physical Valuation).

- [ ] **Step 1: Implement Audit API and SOX Compliance API**.
- [ ] **Step 2: Implement `AuditClient.tsx` and `page.tsx`** with Tabs (Audit Logs, SOX Reconciliation).
- [ ] **Step 3: Add NavBar item** (Icon `ShieldCheck`, label `Audit & Kepatuhan`, roles: super-admin, manager).
- [ ] **Step 4: Run build & tests** → PASS.
- [ ] **Step 5: Commit**  
  `git add src/app/audit src/app/api/audit src/app/api/compliance/sox src/components/common/NavBar.tsx`  
  `git commit -m \"feat: audit trail viewer and SOX compliance reporting\"`

-- ---------------

### Task 5: Integration & Build Verification

**Files:** none (verification)

- [ ] **Step 1: Run `npx next build`** locally.
- [ ] **Step 2: Run all test suites**.
- [ ] **Step 3: Push to `origin/main`** (`git push origin main`).
- [ ] **Step 4: Verify live deployment** on Vercel.
