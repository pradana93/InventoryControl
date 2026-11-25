# Entity-Aware Inventory Control (BBB/BBT) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the entire Inventory Control app entity-aware (BBB / BBT / All) with a global NavBar selector, URL sync, API filtering, and smart PDF entity detection.

**Architecture:** Global entity selector in NavBar → persists to localStorage + updates URL `?ent=BBB` → all pages read from URL → pass `ent` to all API calls → API routes filter by entity → Dashboard/Inbound/Outbound/Opname/Labels show entity-scoped data.

**Tech Stack:** Next.js 16 App Router, React 19, Tailwind CSS 4, shadcn/ui, Google Sheets API, NextAuth v5, pdfjs-dist, xlsx.

**Spec:** `docs/superpowers/specs/2026-11-25-entity-aware-inventory-control-design.md`

---

## Global Constraints

- All API routes must accept `ent` query param (`BBB` | `BBT` | `ALL` or omitted=default `BBB`)
- Entity color coding: BBB=amber, BBT=sky, All=purple (consistent across all pages)
- Rack IDs globally unique: `A01xx`=BBT, `A02xx`=BBB
- Catalog has `Entitas` column; Warehouse has `Entitas` column
- No cross-entity transactions allowed (server-enforced)
- PDF parser detects PT name: "PT Bangor Berkembang Bersama"→BBB, "PT Bangor Berani Terukur"→BBT
- Vercel serverless 10s timeout; keep API responses fast
- Bahasa Indonesia UI; Bahasa month names in exports (Jan–Dec)

---

## Review Focus

| Input / Condition | Expected Behavior |
|-------------------|-------------------|
| User switches entity in NavBar while on `/outbound` with unsaved PDF parse | Warn before switching? Or auto-save draft? → **Task 4 handles: show confirmation modal if dirty state** |
| Direct URL `/dashboard?ent=INVALID` | Default to `BBB` silently, no error |
| Outbound PDF has no detectable PT name | Show entity selection modal before SKU matching |
| Manager views "All" on Dashboard | Shows combined KPIs + stacked charts + grouped tables with entity badges |
| Inbound submit with rack from wrong entity | API returns 400 with clear message "Rak A0101A milik BBT, tidak bisa untuk BBB" |

---

## File Map

| File | Responsibility |
|------|----------------|
| `src/hooks/useEntity.ts` (NEW) | Client hook: reads `ent` from URL, provides `entity`, `setEntity()` with URL sync + localStorage |
| `src/lib/constants.ts` (NEW) | Entity constants, colors, PT detection patterns |
| `src/components/common/NavBar.tsx` (MODIFY) | Add entity selector dropdown + badge |
| `src/app/api/dashboard/route.ts` (MODIFY) | Accept `ent`, filter Catalog/Warehouse/Ledger, return `entity` in response |
| `src/app/api/rack/route.ts` (MODIFY) | Accept `ent`, filter `Physical_Warehouse.entitas` |
| `src/app/api/fefo/route.ts` (MODIFY) | Accept `ent`, filter by entity |
| `src/app/api/inbound/route.ts` (MODIFY) | Accept `entitas` in body, validate rack entity matches |
| `src/app/api/outbound/allocate/route.ts` (MODIFY) | Accept `entitas` in body, filter stock lots by entity |
| `src/app/api/outbound/confirm/route.ts` (MODIFY) | Accept `entitas` in body, validate all allocations match entity |
| `src/app/api/stock-opname/route.ts` (MODIFY) | Accept `entitas` in body, validate rack/SKU entity |
| `src/app/page.tsx` (MODIFY) | Read `ent`, pass to API, show entity badge, "All" view breakdown |
| `src/app/inbound/page.tsx` (MODIFY) | Entity-scoped SKU + rack pickers, validation |
| `src/app/outbound/page.tsx` (MODIFY) | PDF PT detection → auto-set entity → entity-scoped match/alloc/confirm |
| `src/app/opname/page.tsx` (MODIFY) | Entity-filtered rack+SKU list |
| `src/app/labels/page.tsx` (MODIFY) | Entity filter for rack list |

---

## Tasks

### Task 1: Core Infrastructure — Entity Hook, Constants, NavBar Selector

**Files:**
- Create: `src/hooks/useEntity.ts`
- Create: `src/lib/constants.ts`
- Modify: `src/components/common/NavBar.tsx`

**Interfaces:**
- `useEntity()` returns `{ entity: 'BBB'|'BBT'|'ALL', setEntity: (e) => void, badge: BadgeConfig }`
- `constants.ts` exports `ENTITY_COLORS`, `PT_PATTERNS`, `ENTITY_OPTIONS`

- [ ] **Step 1.1: Create `src/lib/constants.ts`**

```typescript
export type Entity = 'BBB' | 'BBT' | 'ALL';

export const ENTITY_OPTIONS: { value: Entity; label: string; short: string }[] = [
  { value: 'BBB', label: 'BBB (PT Bangor Berkembang Bersama)', short: 'BBB' },
  { value: 'BBT', label: 'BBT (PT Bangor Berani Terukur)', short: 'BBT' },
  { value: 'ALL', label: 'Semua Entitas', short: 'All' },
];

export const ENTITY_COLORS: Record<Entity, { bg: string; text: string; border: string; badge: string }> = {
  BBB: { bg: 'bg-amber-500/20', text: 'text-amber-700', border: 'border-amber-300', badge: 'bg-amber-100 text-amber-800' },
  BBT: { bg: 'bg-sky-500/20', text: 'text-sky-700', border: 'border-sky-300', badge: 'bg-sky-100 text-sky-800' },
  ALL: { bg: 'bg-purple-500/20', text: 'text-purple-700', border: 'border-purple-300', badge: 'bg-purple-100 text-purple-800' },
};

export const PT_PATTERNS: Record<'BBB' | 'BBT', string[]> = {
  BBB: ['PT BANGOR BERKEMBANG BERSAMA', 'BERKEMBANG BERSAMA', 'PT BBB'],
  BBT: ['PT BANGOR BERANI TERUKUR', 'BERANI TERUKUR', 'PT BBT'],
};
```

- [ ] **Step 1.2: Create `src/hooks/useEntity.ts`**

```typescript
'use client';
import { useSearchParams, useRouter, usePathname } from 'next/navigation';
import { useEffect, useState } from 'react';
import { Entity } from '@/lib/constants';

export function useEntity(): { entity: Entity; setEntity: (e: Entity) => void; badge: typeof ENTITY_COLORS[keyof typeof ENTITY_COLORS] } {
  const searchParams = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();
  const [entity, setEntityState] = useState<Entity>('BBB');

  useEffect(() => {
    const ent = searchParams.get('ent')?.toUpperCase();
    if (ent === 'BBB' || ent === 'BBT' || ent === 'ALL') {
      setEntityState(ent);
    } else {
      // Default from localStorage or BBB
      const saved = localStorage.getItem('selectedEntity') as Entity | null;
      setEntityState(saved || 'BBB');
    }
  }, [searchParams]);

  const setEntity = (newEntity: Entity) => {
    setEntityState(newEntity);
    localStorage.setItem('selectedEntity', newEntity);
    const params = new URLSearchParams(searchParams.toString());
    if (newEntity === 'ALL') {
      params.delete('ent');
    } else {
      params.set('ent', newEntity);
    }
    router.push(`${pathname}?${params.toString()}`, { scroll: false });
  };

  // badge config imported from constants
  return { entity, setEntity, badge: ENTITY_COLORS[entity] };
}
```

- [ ] **Step 1.3: Modify `src/components/common/NavBar.tsx` — Add entity selector dropdown + badge**

```tsx
// Add imports
import { useEntity } from '@/hooks/useEntity';
import { ENTITY_OPTIONS, ENTITY_COLORS } from '@/lib/constants';
import { Globe, ChevronDown } from 'lucide-react';

// In NavBar component, after user menu:
const { entity, setEntity, badge } = useEntity();

// Render entity selector (next to user menu, before user menu):
<div className="relative">
  <button 
    className={`flex items-center gap-2 px-3 py-1.5 rounded-lg border text-sm font-medium transition-colors ${ENTITY_COLORS[entity].bg} ${ENTITY_COLORS[entity].text} ${ENTITY_COLORS[entity].border}`}
    onClick={() => setEntity(entity === 'BBB' ? 'BBT' : entity === 'BBT' ? 'ALL' : 'BBB')} // quick cycle, or dropdown
  >
    <Globe className="h-4 w-4" />
    <span>{ENTITY_OPTIONS.find(o => o.value === entity)?.short}</span>
    <ChevronDown className="h-3 w-3" />
  </button>
  {/* Dropdown menu with ENTITY_OPTIONS, onClick calls setEntity */}
</div>
```

- [ ] **Step 1.4: Verify build passes**
Run: `npm run build` → PASS

- [ ] **Step 1.5: Commit**
```bash
git add src/lib/constants.ts src/hooks/useEntity.ts src/components/common/NavBar.tsx
git commit -m "feat: core entity infrastructure (hook, constants, NavBar selector)"
```

---

### Task 2: Dashboard API + Page — Entity-Scoped KPIs, Charts, Tables

**Files:**
- Modify: `src/app/api/dashboard/route.ts`
- Modify: `src/app/page.tsx`
- Modify: `src/components/dashboard/*` (as needed)

**Interfaces:**
- `GET /api/dashboard?ent=BBB` → returns `{ entity: 'BBB', summary, zoneDistribution, topSkus, expiredLots, expiringSoon, stockHabis, lots }`
- `entity` field in response for UI badge

- [ ] **Step 2.1: Modify `src/app/api/dashboard/route.ts` — Accept `ent`, filter all queries**
  - Read `ent` from `searchParams.get('ent')`
  - Filter `getCatalog()` by `c.entitas === ent` (if not 'ALL')
  - Filter `getWarehouse()` by `w.entitas === ent`
  - Filter `getLedger()` by joining with filtered warehouse/catalog
  - Compute KPIs, charts, alerts from filtered data
  - Return `entity` in response

- [ ] **Step 2.2: Modify `src/app/page.tsx` — Use `useEntity()`, pass to API, show badge**
  - Import `useEntity` from `@/hooks/useEntity`
  - In component: `const { entity, badge } = useEntity()`
  - Fetch: `/api/dashboard?ent=${entity}`
  - Show entity badge in header: `<span className={...badge}>Dashboard — {entity}</span>`
  - If `entity === 'ALL'`: render combined + per-entity breakdown (stacked bar chart, grouped table)

- [ ] **Step 2.3: Update Dashboard components** — Accept `entity` prop for badges/colors

- [ ] **Step 2.4: Verify build + manual test**
  - Switch entity in NavBar → Dashboard updates
  - Direct URL `/dashboard?ent=BBT` loads BBT data
  - "All" view shows combined + breakdown

- [ ] **Step 2.5: Commit**
```bash
git add src/app/api/dashboard/route.ts src/app/page.tsx src/components/dashboard/
git commit -m "feat: entity-aware Dashboard (API + page + components)"
```

---

### Task 3: Inbound — Entity-Scoped SKU + Rack Pickers + Validation

**Files:**
- Modify: `src/app/api/rack/route.ts`
- Modify: `src/app/api/inbound/route.ts`
- Modify: `src/app/inbound/page.tsx`
- Modify: `src/app/inbound/InboundForm.tsx` (if separate)

**Interfaces:**
- `GET /api/rack?ent=BBB` → returns only racks where `entitas === 'BBB'`
- `POST /api/inbound` body includes `entitas: 'BBB'`; validates each rack belongs to entity

- [ ] **Step 3.1: Modify `src/app/api/rack/route.ts` — Add `ent` filter**
- [ ] **Step 3.2: Modify `src/app/api/inbound/route.ts` — Validate rack entity matches body.entitas**
- [ ] **Step 3.3: Modify `src/app/inbound/page.tsx` + `InboundForm.tsx`**
  - Use `useEntity()` to get current entity
  - SKU autocomplete → `/api/sku?action=names&ent=${entity}`
  - Rack picker → `/api/rack?ent=${entity}`
  - Show entity badge: "Inbound — BBB"
  - On submit: include `entitas: entity` in body

- [ ] **Step 3.4: Verify build + test**
  - BBB entity → only BBB racks/SKUs shown
  - Submit BBB SKU + BBT rack → API rejects with clear message

- [ ] **Step 3.5: Commit**
```bash
git add src/app/api/rack/route.ts src/app/api/inbound/route.ts src/app/inbound/
git commit -m "feat: entity-aware Inbound (rack picker, SKU picker, validation)"
```

---

### Task 4: Outbound — Smart PDF Entity Detection + Entity-Scoped Flow

**Files:**
- Modify: `src/app/api/outbound/allocate/route.ts`
- Modify: `src/app/api/outbound/confirm/route.ts`
- Modify: `src/app/outbound/page.tsx`

**Interfaces:**
- `POST /api/outbound/allocate` body: `{ lines, entitas: 'BBB' }` → filters stock lots by entity
- `POST /api/outbound/confirm` body: `{ allocations, roNumber, ..., entitas: 'BBB' }` → validates all allocations match entity
- Page: PDF parse → detect PT name → auto-set entity → entity-scoped SKU match + allocation

- [ ] **Step 4.1: Modify `src/app/outbound/page.tsx` — PDF PT Detection Logic**
  - Add `detectEntityFromPdf(text)` using `PT_PATTERNS` from constants
  - After PDF parse: run detection
  - If detected: `setEntity(detected)` + toast "Entity terdeteksi: BBB"
  - If not detected: show modal "Pilih Entity" with BBB/BBT buttons → on select `setEntity()`
  - Show detected entity prominently in UI
  - SKU fuzzy match → `/api/sku?action=names&ent=${entity}`
  - Allocation/Confirm → include `entitas: entity` in body

- [ ] **Step 4.2: Modify `src/app/api/outbound/allocate/route.ts` — Filter lots by entity**
  - Read `entitas` from body
  - Filter `getWarehouse()` by entity → get rack IDs for that entity
  - Filter `ledger` by those rack IDs
  - Build lots only from entity's racks

- [ ] **Step 4.3: Modify `src/app/api/outbound/confirm/route.ts` — Validate entity**
  - Read `entitas` from body
  - Validate all allocation rack IDs belong to entity (via warehouse)
  - Reject if mismatch

- [ ] **Step 4.4: Verify build + test**
  - PDF with "PT Bangor Berani Terukur" → auto-sets BBT, only BBT SKUs matched
  - PDF without PT name → modal prompts entity
  - Allocation only uses correct entity's racks
  - Confirm validates entity

- [ ] **Step 4.5: Commit**
```bash
git add src/app/api/outbound/allocate/route.ts src/app/api/outbound/confirm/route.ts src/app/outbound/page.tsx
git commit -m "feat: entity-aware Outbound (PDF PT detection, allocation, confirm)"
```

---

### Task 5: Opname & Labels — Entity Filtering

**Files:**
- Modify: `src/app/api/stock-opname/route.ts`
- Modify: `src/app/opname/page.tsx`
- Modify: `src/app/labels/page.tsx`

**Interfaces:**
- Opname: fetch `/api/rack?ent=BBB` → only BBB racks; table shows only BBB SKUs in those racks
- Labels: entity filter dropdown (or read from URL) → only show racks for entity

- [ ] **Step 5.1: Modify `src/app/opname/page.tsx` — Entity-scoped rack+SKU list**
- [ ] **Step 5.2: Modify `src/app/api/stock-opname/route.ts` — Validate entity on submit**
- [ ] **Step 5.3: Modify `src/app/labels/page.tsx` — Entity filter for rack list**
- [ ] **Step 5.4: Verify build + test**
- [ ] **Step 5.5: Commit**
```bash
git add src/app/opname/ src/app/api/stock-opname/route.ts src/app/labels/page.tsx
git commit -m "feat: entity-aware Opname + Labels"
```

---

### Task 6: Polish — Toasts, Shortcuts, Skeletons, "All" View, Color Audit

**Files:**
- Various (touch-ups)

- [ ] **Step 6.1: Entity switch toast** — "Beralih ke BBB — Dashboard diperbarui"
- [ ] **Step 6.2: Keyboard shortcut `Ctrl+Shift+E`** — Opens entity selector (or cycles)
- [ ] **Step 6.3: Loading skeletons** — Per-entity fetches show skeleton
- [ ] **Step 6.4: "All" view breakdowns** — Dashboard: stacked bar chart, grouped tables with entity badges
- [ ] **Step 6.5: Color consistency audit** — All pages use `ENTITY_COLORS` constants
- [ ] **Step 6.6: Mobile responsive** — Entity selector accessible on small screens (dropdown in user menu on mobile)
- [ ] **Step 6.7: Verify build + full manual test**
- [ ] **Step 6.8: Commit**
```bash
git add -A
git commit -m "feat: entity polish (toasts, shortcuts, skeletons, All view, color audit)"
```

---

## Execution Order

1. **Task 1** (Core) — blocks all others
2. **Task 2** (Dashboard) — validates core + API pattern
3. **Task 3** (Inbound) — uses core + rack API
4. **Task 4** (Outbound) — most complex, uses core + PDF detection
5. **Task 5** (Opname + Labels) — simpler, uses core
6. **Task 6** (Polish) — touches everything

---

**Plan complete.** Ready for review and execution method selection.