# Design Doc: Entity-Aware Inventory Control (BBB / BBT)

**Date:** 2026-11-25  
**Status:** Approved — ready for implementation  
**Approach:** A + C (Global Entity Selector + URL Sync)

---

## 1. Intent & Why

The warehouse serves **two legal entities** (PT Bangor Berkembang Bersama = **BBB**, PT Bangor Berani Terukur = **BBT**) with **separate SKU catalogs, separate racks, and separate inventory flows**. Operators and Managers work across both. The system must:

- Prevent cross-entity allocation errors (BBT goods → BBB racks)
- Show entity-scoped KPIs, charts, alerts, and tables by default
- Allow instant switching between entities (and "All" for consolidated view)
- Auto-detect entity from PDF metadata (PT name) during outbound parsing
- Feel premium: fast, responsive, zero ambiguity about which entity you're viewing

---

## 2. Goals / Non-Goals / Anti-Goals

| Goals | Non-Goals | Anti-Goals |
|-------|-----------|------------|
| Global entity selector in NavBar (BBB / BBT / All) persisted + URL-synced | Multi-entity single transaction (never happens per business rules) | Separate logins per entity |
| Dashboard: entity-scoped KPIs, charts, FEFO alerts, tables | User-specific entity assignment (all users see both) | Hardcoded entity per user role |
| Inbound: rack picker filtered by entity; SKU picker filtered by entity | Cross-entity transfers (out of scope) | Entity leakage in any API response |
| Outbound: PDF parser reads PT name → sets entity → filters SKU match + allocation | OCR for PDFs (text extraction is fine) | Manual entity selection on every outbound |
| Opname: entity-filtered rack+SKU list | | |
| All APIs accept `entitas=BBB|BBT|ALL` query param | | |

---

## 3. Constraints

- **Google Sheets backend** — all filtering happens in API routes (client-side fallback for small datasets)
- **Rack IDs globally unique** — `A01xx` = BBT, `A02xx` = BBB; no collision
- **Catalog has `Entitas` column** — `BBB` or `BBT` per row; 21 overlapping names exist as distinct rows
- **Warehouse has `Entitas` column** — already populated per rack
- **NextAuth v5** — session available in middleware and API routes
- **Vercel deployment** — serverless functions, 10s timeout for API routes

---

## 4. Approaches Considered

| Approach | Description | Verdict |
|----------|-------------|---------|
| **A: Global Selector (NavBar) + URL Sync** | Single dropdown in NavBar, persists to localStorage, updates `?ent=BBB` in URL. All pages read from URL. | ✅ **Chosen** — single source of truth, shareable URLs, premium UX |
| B: Per-Page Tabs | Each page has its own [BBB][BBT][All] tabs. | ❌ Inconsistent, repetitive, no cross-page context |
| C: URL-Only (`/dashboard?ent=BBB`) | No UI selector; user edits URL. | ❌ Not discoverable, poor UX |
| A+C Combined | Global selector UI + URL sync + API threading. | ✅ **Chosen** — best of both |

---

## 5. Architecture & Data Flow

```
┌─────────────────────────────────────────────────────────────────┐
│                        NAVBAR (Client)                          │
│  [Logo]  Dashboard  Inbound  Outbound  Opname  Labels  Users    │
│                                                      [👤 User] [🌐 Entity ▼]  │
│                              │                                  │
│                              ▼                                  │
│  localStorage.setItem('entitas', 'BBB')                         │
│  router.push({ query: { ...searchParams, ent: 'BBB' }})        │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│                      PAGE COMPONENTS (Client)                   │
│  useSearchParams() → ent = searchParams.get('ent') || 'BBB'    │
│  Pass `ent` to all fetch() calls: `/api/dashboard?ent=BBB`     │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│                        API ROUTES (Server)                      │
│  GET /api/dashboard?ent=BBB     → filter Catalog, Warehouse,   │
│  GET /api/sku?ent=BBB           → Ledger by entitas            │
│  GET /api/rack?ent=BBB          →                              │
│  POST /api/inbound              → validate rack.entitas ===    │
│  POST /api/outbound/allocate    → body.entitas; filter lots    │
│  POST /api/outbound/confirm     → body.entitas; validate       │
│  POST /api/stock-opname         → body.entitas; filter         │
└─────────────────────────────────────────────────────────────────┘
```

---

## 6. Component Specifications

### 6.1 NavBar Entity Selector (`src/components/common/NavBar.tsx`)

```tsx
// New state in NavBar
const [entity, setEntity] = useState<'BBB' | 'BBT' | 'ALL'>('BBB');

// Dropdown: BBB | BBT | All Entities
// On change: 
//   - localStorage.setItem('selectedEntity', newEntity)
//   - router.push({ query: { ...searchParams, ent: newEntity === 'ALL' ? '' : newEntity } })
//   - No full page reload (shallow routing)

// Badge next to selector showing current entity (color-coded):
// BBB = amber, BBT = sky, All = purple
```

**Color coding (consistent across app):**
| Entity | Color | Tailwind Classes |
|--------|-------|------------------|
| BBB | Amber | `bg-amber-500/20 text-amber-700 border-amber-300` |
| BBT | Sky | `bg-sky-500/20 text-sky-700 border-sky-300` |
| All | Purple | `bg-purple-500/20 text-purple-700 border-purple-300` |

---

### 6.2 Dashboard (`src/app/page.tsx` + components)

**Changes:**
- Read `ent` from `searchParams` (default `'BBB'`)
- Pass to `/api/dashboard?ent=BBB`
- Display **entity badge** in header: "Dashboard — BBB"
- KPIs, charts, alerts, tables all scoped
- If `ent === 'ALL'`: show combined + breakdown by entity (stacked bars, grouped tables)

**API `/api/dashboard` response shape (new):**
```json
{
  "entity": "BBB",
  "summary": { "totalSKU": 122, "totalSystemQty": 4500, ... },
  "zoneDistribution": [{ "zone": "RACKING", "qty": 3200, "entity": "BBB" }],
  "topSkus": [{ "namaBarang": "Apron", "qty": 500, "entity": "BBB" }],
  "expiredLots": [...],
  "expiringSoon": [...],
  "stockHabis": [...],
  "lots": [...]
}
```

---

### 6.3 Inbound Page (`src/app/inbound/page.tsx`)

**Changes:**
- Entity selector inherited from URL (read-only display in page header)
- **SKU autocomplete** → `/api/sku?action=names&ent=BBB`
- **Rack picker** → `/api/rack?ent=BBB` (only racks where `entitas === BBB`)
- On submit: validate `rack.entitas === selectedEntity` (server-side)
- Show entity badge: "Inbound — BBB"

---

### 6.4 Outbound Page (`src/app/outbound/page.tsx`)

**Major Enhancement — Smart PDF Parser:**

```typescript
// 1. Parse PDF text
// 2. Detect PT name in header:
//    - "PT Bangor Berkembang Bersama" → entity = 'BBB'
//    - "PT Bangor Berani Terukur" → entity = 'BBT'
//    - Fallback: prompt user to select entity (modal)
// 3. Set entity in page state + URL
// 4. SKU fuzzy match → `/api/sku?action=names&ent=BBB` (only that entity's SKUs)
// 5. Allocation → POST /api/outbound/allocate with { lines, entitas: 'BBB' }
// 6. Confirm → POST /api/outbound/confirm with { allocations, roNumber, ..., entitas: 'BBB' }
```

**UI:**
- Show detected entity prominently after PDF parse: "Detected Entity: **BBB** (PT Bangor Berkembang Bersama)"
- Allow manual override if detection fails
- Entity badge in header: "Outbound — BBB"

---

### 6.5 Stock Opname (`src/app/opname/page.tsx`)

- Read `ent` from URL
- Fetch `/api/rack?ent=BBB` → only BBB racks
- Table shows only `SKU.entitas === BBB` in those racks
- Entity badge: "Stock Opname — BBB"

---

### 6.6 Labels (`src/app/labels/page.tsx`)

- Entity filter dropdown (or read from URL)
- Only show racks for selected entity
- QR payload includes entity

---

### 6.7 API Route Updates

| Route | Changes |
|-------|---------|
| `GET /api/dashboard` | Accept `ent` param; filter Catalog, Warehouse, Ledger; return `entity` in response |
| `GET /api/sku` | Already supports `entitas` param ✅ |
| `GET /api/rack` | Add `ent` param; filter `Warehouse.entitas` |
| `GET /api/fefo` | Add `ent` param; filter by entity |
| `POST /api/inbound` | Accept `entitas` in body; validate rack belongs to entity |
| `POST /api/outbound/allocate` | Accept `entitas` in body; filter stock lots by entity (via rack) |
| `POST /api/outbound/confirm` | Accept `entitas` in body; validate all allocations match entity |
| `POST /api/stock-opname` | Accept `entitas` in body; validate rack/SKU match entity |

---

## 7. PDF Parser — PT Name Detection Logic

```typescript
const PT_PATTERNS = {
  BBB: ['PT Bangor Berkembang Bersama', 'Berkembang Bersama', 'PT BBB'],
  BBT: ['PT Bangor Berani Terukur', 'Berani Terukur', 'PT BBT'],
};

function detectEntityFromPdfText(text: string): 'BBB' | 'BBT' | null {
  const upper = text.toUpperCase();
  for (const [entity, patterns] of Object.entries(PT_PATTERNS)) {
    for (const p of patterns) {
      if (upper.includes(p.toUpperCase())) return entity as 'BBB' | 'BBT';
    }
  }
  return null;
}
```

- Run detection immediately after PDF text extraction
- If detected → auto-set entity + show toast "Entity detected: BBB"
- If not detected → show modal "Pilih Entity untuk Outbound ini" with BBB/BBT buttons

---

## 8. UX Details (Premium Feel)

| Detail | Implementation |
|--------|----------------|
| Entity badge in page header | Top-left of each page content area, consistent position |
| Color-coded tables | Row hover shows entity color accent; overlapping SKU names get entity tag |
| Toast on entity switch | "Switched to BBB — Dashboard updated" |
| Keyboard shortcut | `Ctrl+Shift+E` opens entity selector dropdown |
| Persisted preference | `localStorage` remembers last selection per browser |
| Shareable URLs | Send `/outbound?ent=BBT` to colleague — opens in correct entity |
| Loading skeletons | Per-entity data fetches show skeleton while loading |

---

## 9. Implementation Order

| Phase | Tasks | Est. |
|-------|-------|------|
| **1. Core Infrastructure** | NavBar entity selector + URL sync + localStorage; `useEntity()` hook; color constants | 1.5h |
| **2. Dashboard** | Update `/api/dashboard` + page + components for entity filtering; entity badge; "All" view | 2h |
| **3. Inbound** | Update page + `/api/inbound` + `/api/rack` for entity; validation | 1.5h |
| **4. Outbound** | PDF PT detection; entity-aware SKU match + allocation + confirm; UI badges | 2.5h |
| **5. Opname & Labels** | Entity filtering on both pages + APIs | 1h |
| **6. Polish** | Toasts, shortcuts, skeletons, "All" view breakdowns, color consistency audit | 1.5h |
| **Total** | | **~10h** |

---

## 10. Open Decisions (None — all resolved)

| Question | Answer |
|----------|--------|
| Default entity for new users? | BBB (first in dropdown) |
| Can operators see "All"? | Yes — per answer #2 |
| PDF detection confidence? | High (PT name in header); fallback to modal |
| Cross-entity validation? | Server-side enforced on every mutating API |

---

## 11. Testing Checklist

- [ ] Switch entity in NavBar → all pages update without reload
- [ ] Direct URL `/dashboard?ent=BBT` loads BBT dashboard
- [ ] Inbound: BBB SKU + BBT rack → rejected by API
- [ ] Outbound: PDF with "PT Bangor Berani Terukur" → auto-sets BBT
- [ ] Outbound: PDF without PT name → modal prompts entity
- [ ] Opname: only shows racks/SKUs for selected entity
- [ ] "All" view shows combined + per-entity breakdown
- [ ] Color coding consistent across all pages
- [ ] localStorage persists across browser sessions
- [ ] Mobile responsive: entity selector accessible on small screens

---

**Approval:** ✅ Ready to implement. No further questions.