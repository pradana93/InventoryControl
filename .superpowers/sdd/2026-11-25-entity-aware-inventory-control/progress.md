# SDD ledger — plan: docs/superpowers/plans/2026-11-25-entity-aware-inventory-control.md

Task 1: complete (commit 45307c0, verify: npm run build → PASS)
  - src/lib/constants.ts (Entity type, ENTITY_OPTIONS, ENTITY_COLORS, PT_PATTERNS)
  - src/hooks/useEntity.ts (URL + localStorage sync)
  - NavBar entity selector + badge
  - AppShell wraps NavBar in Suspense (fixes useSearchParams prerender)

Task 2: complete (commit 6ed253f, verify: npm run build → PASS)
  - google-sheets.ts: EntityFilter type; getFullDashboard(entity); getStockDetail(search, entity); getFefoLots(limit, entity)
  - /api/dashboard, /api/dashboard/stream, /api/fefo, /api/sku?action=stock, /api/rack?action=detail → entity aware
  - src/app/page.tsx: entity badge + Suspense
  - DashboardView, DashboardGrid, DashboardContent, EnhancedStockTables, StockTables, Charts, AlertBanner → entity-aware
  - AlertBanner.outOfStock now {namaBarang, entitas}[]
