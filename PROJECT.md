# 📦 Inventory Control — Project Documentation & Progress Log

> **Purpose of this file:** This is the living memory of the project. It records the
> architecture, key decisions, current implementation state, known issues, and the
> next steps. Update this file whenever significant work lands, so context survives
> across sessions.
>
> **Last updated:** 2026-11-25

---

## 1. Project Overview

A modern warehouse **Inventory Control** and **Picking List generator** for
**PT. Bangor SCM (BBT Warehouse)** — a burger/packaging distribution business.

The system was **migrated from Google Apps Script (GAS)** to a full
**Next.js 16 web application** backed by **Google Sheets as a headless database**.

| Item | Value |
|------|-------|
| Stack | Next.js 16.4.6 (App Router) · React 19.3 · TypeScript 5 · Tailwind CSS 4 |
| UI kit | shadcn/ui (Radix primitives) + lucide-react icons |
| Database | Google Sheets API v4 (service account) |
| Auth | NextAuth.js v5 (beta) — Credentials + Google OAuth |
| PDF parsing | `pdfjs-dist` (client-side) |
| Excel export | `xlsx` (server-side) |
| Hosting | Vercel (Production) |
| Language | UI in **Bahasa Indonesia** |

### Production URLs
- **Primary (aliased):** https://inventory-control-five.vercel.app
- **Spreadsheet ID:** `1WxJNJrvez9Du_IlyL1jhLQIn8haXBN-azFB0acOkRpw`
- **Default Super Admin:** `majestap93@gmail.com` / `majestap93`

---

## 2. Repository Layout

```text
├── legacy-gas/                       # Archived Google Apps Script v1 (reference only)
├── public/                           # Static assets + auto-copied pdf.worker.min.mjs
├── scripts/
│   └── copy-pdf-worker.js            # postinstall → copies PDF worker into /public
├── src/
│   ├── app/
│   │   ├── api/
│   │   │   ├── auth/[...nextauth]/   # NextAuth handler
│   │   │   ├── dashboard/            # KPIs, alerts, chart data
│   │   │   ├── dashboard/stream/     # SSE real-time dashboard updates
│   │   │   ├── fefo/                 # FEFO lot listing
│   │   │   ├── health/               # Health check (public)
│   │   │   ├── inbound/              # Inbound submit + rack allocation
│   │   │   ├── inbound/scan/         # Public mobile inbound scan (POST)
│   │   │   ├── outbound/allocate/    # FEFO allocation + rack sequencing engine
│   │   │   ├── outbound/confirm/     # Write outbound ledger + Picking_List rows
│   │   │   ├── outbound/export/[pickingListNo]/  # Excel (.xlsx) generator
│   │   │   ├── rack/                 # Rack master data / details
│   │   │   ├── rack/scan/[rackId]/   # Public rack lookup for scanner (GET)
│   │   │   ├── sku/                  # Public catalog SKU list (fuzzy match source)
│   │   │   ├── stock-opname/         # Manual count + variance
│   │   │   └── users/                # SUPER ADMIN user management (GET/POST/PUT)
│   │   ├── inbound/                  # Inbound receiving page
│   │   ├── inbound/scan/[rackId]/    # Public mobile scanner page
│   │   ├── labels/                   # Rack label QR generator
│   │   ├── login/                    # Login page
│   │   ├── opname/                   # Stock Opname page
│   │   ├── outbound/                 # Outbound flow + picking list
│   │   ├── users/                    # SUPER ADMIN user management UI
│   │   ├── layout.tsx                # Root layout + NavBar
│   │   └── page.tsx                  # Dashboard (/)
│   ├── components/
│   │   ├── common/                   # NavBar, KPICard, AlertBanner, charts
│   │   ├── dashboard/                # Dashboard tables & metric views
│   │   ├── inbound/                  # Inbound sub-components
│   │   └── ui/                       # shadcn/ui primitives
│   ├── lib/
│   │   ├── auth.ts                   # NextAuth config (providers, callbacks, cookies)
│   │   ├── google-sheets.ts          # Sheets client, models, business logic
│   │   ├── user-service.ts           # Users sheet CRUD + bcrypt auth
│   │   └── utils.ts                  # cn() class merge helper
│   ├── types/
│   │   └── next-auth.d.ts            # NextAuth Session/JWT/User augmentation
│   └── proxy.ts                      # MIDDLEWARE (Next 16 "proxy" file) — RBAC + public routes
├── .env.example
├── next.config.ts
├── package.json
└── tsconfig.json
```

> **Note (Next.js 16):** middleware lives in `src/proxy.ts` and exports `proxy()`
> (not the older `middleware.ts`). See the `nextjs-agent-rules` block in `AGENTS.md`.

---

## 3. Google Sheets Schema (Normalized)

| Sheet | Purpose | Key columns |
|-------|---------|-------------|
| `Catalog` | SKU master | `SKU_ID`, `Nama_Barang`, `Satuan`, `Kategori`, `Status`, `Entitas` (BBB/BBT), `Barcode` |
| `Physical_Warehouse` | Rack master | `Rack_ID`, `Jenis_Lokasi` (zone), `Entitas` (BBB/BBT), `Status` |
| `Ledger` | Stock movements (source of truth) | `Record_ID`, `Timestamp`, `SKU_Name`, `Rack_ID`, `Qty_In`, `Expired_Date`, `SJ_Number`, `Remarks` |
| `Stock_Opname` | Manual physical counts | rack+SKU, `Qty_Fisik_SOH`, timestamp, variances |
| `Rack_Labels` | QR label generator output | `Rack_ID`, label payload |
| `Picking_List` | Outbound picking lines | `No`, `Picking_List_No`, `RO_Number`, `Customer`, `Branch`, `RO_Date`, `Rack_ID`, `SKU_Name`, `Qty_Pick`, `Expired_Date`, `Zone`, `Sequence`, `Status`, `Timestamp` |
| `Users` | Auth + roles | `Email`, `PasswordHash` (bcrypt), `Name`, `Role`, `CreatedAt`, `CreatedBy` |

**Ledger convention:** `Qty_In` is **positive for inbound**, **negative for outbound**.
True stock = sum of `Qty_In` per `SKU + Rack + Expiry` lot.

### Two Entities: BBB & BBT
The warehouse serves **two entities**, each with its own SKU catalog and its own
racks, requiring **separate inventory control per entity**:

| Entity | Rack range | SKU count |
|--------|-----------|-----------|
| **BBT** | `A0101*`–`A0112*`, `Floor-A*`, `C-A*`/`C-B*`, `FR1xx` | 30 SKUs |
| **BBB** | `A0201*`–`A0212*`, `Floor B*`, `C-C*`/`C-D*`, `FR2xx` | 122 SKUs |

- `Catalog.Entitas` tags every SKU as `BBB` or `BBT`. 21 SKU names exist in **both**
  entities (e.g. `BBQ Sauce`, `Burger Bun`, `Kentang Goreng`) — these are **distinct
  rows** with distinct `SKU_ID` prefixes (`BBB-###` vs `BBT-###`).
- `Physical_Warehouse.Entitas` tags every rack.
- `/api/sku` accepts an optional `entitas=BBB|BBT` filter and returns the entity.

**Legacy sheets** (read-only, kept for backward compat): `Inventory`, `Inbound`,
`Dasboard`, `Master Data`.

---

## 4. Roles & Access Control

| Role | Access |
|------|--------|
| **super-admin** | Everything + **User Management** (`/users`, `/api/users`) |
| **manager** | Dashboard, Inbound, Outbound, Stock Opname, Labels/Rack |
| **operator** | Dashboard, Stock Opname, Outbound, mobile scanner |

### Public routes (no auth) — defined in `src/proxy.ts`
- `/login`, `/api/auth/*`, `/api/health`
- `/inbound/scan/*`, `/api/rack/scan/*`, `/api/inbound/scan` (mobile scanner)
- `/api/sku` (public SKU catalog for client-side fuzzy match)

### Protected route rules (in `src/proxy.ts`)
- `/users` and `/api/users/*` → **super-admin only**
- `/inbound` (except `/inbound/scan`) → super-admin + manager
- Everything else → any authenticated user

---

## 5. Core Business Logic

### 5.1 FEFO Allocation Engine (`/api/outbound/allocate`)
1. Loads `Ledger`, `Physical_Warehouse`, `Catalog` in parallel.
2. Builds **lots** keyed by `SKU | Rack | Expiry`, **netting inbound vs outbound**
   (`qty += Qty_In`) so repeat runs never over-allocate.
3. Sorts lots by expiry (FEFO) and allocates ordered qty across lots.
4. Re-sequences the resulting pick points by **zone → rack** for an efficient
   walking path.
5. Returns `allocations: [{ rackId, skuName, qtyAllocated, expiredDate, expiredLabel, zone, sequence }]`.

> Month labels use English abbreviations (`Jan…Dec`) — **not** Indonesian (`Ags`→`Aug`).

### 5.2 Outbound Confirmation (`/api/outbound/confirm`)
- Requires `roNumber` (RO Number).
- Writes **negative** ledger entries for each allocation.
- Appends `Picking_List` rows with RO details.
- Generates picking list number: **`PL-YYMMDD-timestamp`** (e.g. `PL-261125-249817`).

### 5.3 Excel Export (`/api/outbound/export/[pickingListNo]`)
- Uses **flexible column matching** (searches header aliases) so it survives
  schema/column-order changes.
- Layout: header block (RO Number, Customer, Branch, RO Date, Printed info) +
  picking table (Seq, Rack, Zona, SKU Name, Qty Pick, Expired Date) + TOTAL row.

### 5.4 PDF Parsing (`/outbound` page, client-side)
- Drag & drop Accurate ERP "rekap order" PDF.
- `pdfjs-dist` extracts text; a **state-machine parser** handles multi-unit items
  (pcs/pack/dus/bks/jrg/ikat) and pagination (skips repeated "Nama Barang" headers).
- Fuzzy-matches each parsed item against `/api/sku` catalog names.
- Manual corrections possible before allocation.

### 5.5 Stock Opname (`/opname`)
- Manual physical count entry, computes variance vs system qty and accuracy %.

### 5.6 User Management (`/users`) — Super Admin only
- `GET /api/users` — list users (no password hashes exposed).
- `POST /api/users` — create user (email, password ≥ 6 chars, name, role).
- `PUT /api/users/[email]` — change a user's role.
- Main Super Admin (`SUPER_ADMIN_EMAIL`) cannot be deleted or have its role changed.
- Passwords hashed with bcryptjs (salt rounds = 10).

---

## 6. Environment Variables

`.env.local` (local) / Vercel Project Settings (production):

```env
GOOGLE_SERVICE_ACCOUNT_EMAIL="..."
GOOGLE_PRIVATE_KEY="-----BEGIN PRIVATE KEY-----\n...\n-----END PRIVATE KEY-----\n"
GOOGLE_SHEET_ID="1WxJNJrvez9Du_IlyL1jhLQIn8haXBN-azFB0acOkRpw"

# Auth
NEXTAUTH_SECRET=...            # or AUTH_SECRET
GOOGLE_CLIENT_ID=...           # for Google OAuth (optional)
GOOGLE_CLIENT_SECRET=...

# User seeding
SUPER_ADMIN_EMAIL="majestap93@gmail.com"
DEFAULT_SUPER_ADMIN_PASSWORD="majestap93"
```

> In production, NextAuth sets cookies with the `__Secure-` prefix. The middleware
> (`src/proxy.ts`) and `src/lib/auth.ts` must use the **same** cookie name logic.

---

## 7. Local Development & Deployment

```bash
npm install          # also runs postinstall → copies pdf worker to /public
npm run dev          # http://localhost:3000
npm run build        # production build + type check
npm run lint         # eslint

# Deploy to Vercel production
git add -A && git commit -m "..."
npx vercel --prod --yes
```

Auto-deploys to the aliased production URL `inventory-control-five.vercel.app`.

---

## 8. Progress Log

### ✅ Completed
- [x] Migrated project off GAS to Next.js 16 + TypeScript + Tailwind.
- [x] **Google Sheets** normalized DB + service-account client (`src/lib/google-sheets.ts`).
- [x] **Auth**: NextAuth v5, Credentials + Google OAuth, bcrypt, role-based middleware.
- [x] **Dashboard** (`/`): KPIs, expiry/OOS alerts, charts, multi-level tables, SSE live updates.
- [x] **Inbound** (`/inbound`): multi-rack allocation (up to 6), live stock preview, validation.
- [x] **Mobile scanner** (`/inbound/scan/[rackId]`): public, QR-driven receiving.
- [x] **Rack Labels** (`/labels`): QR generation.
- [x] **Stock Opname** (`/opname`): manual count + variance/accuracy.
- [x] **Outbound** (`/outbound`): PDF drag-drop parse, fuzzy SKU match, review table.
- [x] **FEFO allocation** engine with **net-lot stock** (no over-allocation) + rack sequencing.
- [x] **RO details dialog** (RO Number* / Customer / Branch / Date) before confirm.
- [x] **Outbound confirm**: negative ledger writes + `Picking_List` records.
- [x] **Excel export** `.xlsx` with header block + picking table + TOTAL.
- [x] Reset `Picking_List` sheet to correct headers (fixed corrupt-Excel bug).
- [x] Robust export API (flexible column matching).
- [x] PL number format → `PL-YYMMDD-timestamp`.
- [x] English month abbreviations in allocations/export.
- [x] Outbound UX: toast notifications + shortcuts (`Ctrl+Enter` confirm/export, `Esc` close).
- [x] **Super Admin User Management** (`/users`): list, create, edit role; role guide cards.
- [x] NavBar "Pengguna" link (super-admin only).
- [x] NextAuth type augmentation (`src/types/next-auth.d.ts`).
- [x] **Entity (BBB/BBT) SKU catalog reset**: added `Entitas` column to `Catalog`,
      replaced all rows from `SKU Vittoria BBB & BBT.xlsx` (122 BBB + 30 BBT = 152 rows,
      21 overlapping names kept as distinct rows per entity).
- [x] `/api/sku` supports `entitas=BBB|BBT` filtering and returns entity per SKU.

### 🔧 Known Issues / Follow-ups
- [ ] Verify end-to-end outbound test after the `Picking_List` header reset
      (PDF → allocate → confirm with RO → export) — user to confirm Excel opens cleanly.
- [ ] Update all UI pages (Dashboard, Inbound, Outbound, Opname) to filter by Entity.
- [ ] PDF parser robustness across varied Accurate export layouts (ongoing).
- [ ] Consider a "delete user" UI action (API `deleteUser` exists in `user-service.ts`
      but no button/route is wired up yet).
- [ ] Consider password reset UI (API `updateUserPassword` exists, not exposed).

### ⏭️ Likely Next Steps
1. Update all UI pages (Dashboard, Inbound, Outbound, Opname) to filter by Entity. This is critical now that the catalog is split.
2. Wire up (**optional**) user delete + password reset to the `/users` page.
3. Add audit trail (who changed which role, when).
4. Confirm the outbound Excel export is clean in a live test.
5. Harden PDF parsing against additional Accurate templates.
6. Review role granularity (e.g. operator access to `/outbound`).

---

## 9. Key Decisions (Rationale)

- **Google Sheets as DB** — chosen for zero-infra, spreadsheet-native ops staff workflow.
- **Normalized sheets** — replaced wide/denormalized legacy layout for cleaner queries.
- **Net-lot allocation** — prevents over-allocation when outbound runs repeatedly.
- **Client-side PDF parse** — avoids uploading sensitive order PDFs to the server;
  server only receives the compact parsed line list.
- **Flexible export column matching** — export survives spreadsheet schema drift.
- **bcrypt + Users sheet** — no external auth DB; seeded Super Admin on first run.
- **`__Secure-` cookie naming** — must stay consistent between `auth.ts` and `proxy.ts`.

---

## 10. Git / Deployment Conventions

- Commit style: `feat:`, `fix:`, `improve:` prefixes.
- Deploy: `npx vercel --prod --yes` after a passing `npm run build`.
- Working tree note: `AGENTS.md` contains a Next.js-managed block that is re-added
  by `next dev`; keep it in commits to keep the tree clean.
