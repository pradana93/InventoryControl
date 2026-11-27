import { NextResponse } from 'next/server';
import {
  getInventoryLots,
  getCatalog,
  getLedger,
  CatalogEntry,
  InventoryLot,
  LedgerEntry,
  EntityFilter,
} from '@/lib/db';
import { filterActiveSkus } from '@/lib/warehouse-optimization';

export const dynamic = 'force-dynamic';

// ============================================================================
// REPORT DATASET TYPES
// ============================================================================

export interface ValuationGroup {
  kategori: string;
  entitas: string;
  skuCount: number;
  totalQty: number;
  totalValue: number;
  skus: Array<{
    skuName: string;
    entitas: string;
    currentStock: number;
    unitCost: number;
    inventoryValue: number;
  }>;
}

export interface SlowMovingItem {
  skuName: string;
  entitas: string;
  currentStock: number;
  unitCost: number;
  inventoryValue: number;
  lastMovement: string;
  daysSinceMovement: number | 'N/A';
  deadStock: boolean;
}

export interface VelocityItem {
  skuName: string;
  entitas: string;
  avgDailyUsage: number;
  currentStock: number;
  daysOfCover: number;
  trend: 'UP' | 'DOWN' | 'FLAT';
}

const MS_PER_DAY = 86400000;

function toDateString(v: string): string {
  if (!v) return '';
  return String(v).slice(0, 10);
}

/**
 * Sum of lots.qty > 0 for a given SKU name.
 */
function currentStockFor(lots: InventoryLot[], skuName: string): number {
  const key = skuName.toLowerCase();
  return lots
    .filter((l) => l.namaBarang.toLowerCase() === key && l.qtySistem > 0)
    .reduce((sum, l) => sum + l.qtySistem, 0);
}

/**
 * Daily-average outbound usage over the trailing 30 days.
 * Mirrors the calculator's definition: total outbound qty / 30 (0 when no
 * outbound activity in the window).
 */
function avgDailyUsageFor(ledger: LedgerEntry[], skuName: string): number {
  const key = skuName.toLowerCase();
  const thirtyDaysAgo = new Date();
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
  const outbound = ledger.filter(
    (e) =>
      e.skuName.toLowerCase() === key &&
      e.qtyIn < 0 &&
      !!e.timestamp &&
      new Date(e.timestamp) >= thirtyDaysAgo
  );
  if (outbound.length === 0) return 0;
  const total = outbound.reduce((sum, e) => sum + Math.abs(e.qtyIn), 0);
  return total / 30;
}

// ----------------------------------------------------------------------------
// (a) Valuation by category
// ----------------------------------------------------------------------------

export function computeValuation(
  lots: InventoryLot[],
  catalog: CatalogEntry[]
): ValuationGroup[] {
  const groups = new Map<string, ValuationGroup>();

  for (const entry of catalog) {
    const kategori = entry.kategori || 'General';
    const entitas = entry.entitas;
    const key = `${kategori}||${entitas}`;

    if (!groups.has(key)) {
      groups.set(key, {
        kategori,
        entitas,
        skuCount: 0,
        totalQty: 0,
        totalValue: 0,
        skus: [],
      });
    }

    const group = groups.get(key)!;
    const currentStock = currentStockFor(lots, entry.namaBarang);
    const inventoryValue = currentStock * (entry.unitCost || 0);

    group.skuCount += 1;
    group.totalQty += currentStock;
    group.totalValue += inventoryValue;
    group.skus.push({
      skuName: entry.namaBarang,
      entitas,
      currentStock,
      unitCost: entry.unitCost || 0,
      inventoryValue,
    });
  }

  for (const group of groups.values()) {
    group.skus.sort((a, b) => b.inventoryValue - a.inventoryValue);
  }

  return Array.from(groups.values()).sort(
    (a, b) => b.totalValue - a.totalValue || a.kategori.localeCompare(b.kategori)
  );
}

// ----------------------------------------------------------------------------
// (b) Slow moving / dead stock
// ----------------------------------------------------------------------------

export function computeSlowMoving(
  lots: InventoryLot[],
  catalog: CatalogEntry[],
  ledger: LedgerEntry[],
  now: Date = new Date()
): SlowMovingItem[] {
  const items: SlowMovingItem[] = [];

  for (const entry of catalog) {
    const currentStock = currentStockFor(lots, entry.namaBarang);
    if (currentStock <= 0) continue;

    const avgDailyUsage = avgDailyUsageFor(ledger, entry.namaBarang);
    if (avgDailyUsage !== 0) continue;

    const movement = latestMovement(ledger, entry.namaBarang, now);

    items.push({
      skuName: entry.namaBarang,
      entitas: entry.entitas,
      currentStock,
      unitCost: entry.unitCost || 0,
      inventoryValue: currentStock * (entry.unitCost || 0),
      lastMovement: movement.lastMovement,
      daysSinceMovement: movement.daysSinceMovement,
      deadStock:
        movement.daysSinceMovement !== 'N/A' && movement.daysSinceMovement > 60,
    });
  }

  return items.sort((a, b) => {
    const av = a.daysSinceMovement === 'N/A' ? Infinity : a.daysSinceMovement;
    const bv = b.daysSinceMovement === 'N/A' ? Infinity : b.daysSinceMovement;
    return bv - av || b.inventoryValue - a.inventoryValue;
  });
}

function latestMovement(
  ledger: LedgerEntry[],
  skuName: string,
  now: Date
): { lastMovement: string; daysSinceMovement: number | 'N/A' } {
  const key = skuName.toLowerCase();
  const entries = ledger
    .filter((e) => e.skuName.toLowerCase() === key && !!e.timestamp)
    .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());

  if (entries.length === 0) {
    return { lastMovement: 'Tidak Ada', daysSinceMovement: 'N/A' };
  }

  const latest = entries[0].timestamp;
  const lastMovement = toDateString(latest);
  const diff = now.getTime() - new Date(latest).getTime();
  const daysSinceMovement = Math.max(0, Math.floor(diff / MS_PER_DAY));

  return { lastMovement, daysSinceMovement };
}

// ----------------------------------------------------------------------------
// (c) Velocity & trend
// ----------------------------------------------------------------------------

export function computeVelocity(
  lots: InventoryLot[],
  catalog: CatalogEntry[],
  ledger: LedgerEntry[],
  now: Date = new Date()
): VelocityItem[] {
  const items: VelocityItem[] = [];

  for (const entry of catalog) {
    const avgDailyUsage = avgDailyUsageFor(ledger, entry.namaBarang);
    if (avgDailyUsage <= 0) continue;

    const currentStock = currentStockFor(lots, entry.namaBarang);
    const daysOfCover = currentStock / avgDailyUsage;

    items.push({
      skuName: entry.namaBarang,
      entitas: entry.entitas,
      avgDailyUsage,
      currentStock,
      daysOfCover,
      trend: computeTrend(ledger, entry.namaBarang, now),
    });
  }

  return items.sort(
    (a, b) => a.daysOfCover - b.daysOfCover || a.skuName.localeCompare(b.skuName)
  );
}

function computeTrend(
  ledger: LedgerEntry[],
  skuName: string,
  now: Date
): 'UP' | 'DOWN' | 'FLAT' {
  const key = skuName.toLowerCase();
  const nowMs = now.getTime();
  const sevenDaysMs = 7 * MS_PER_DAY;

  let last7 = 0;
  let prior7 = 0;

  for (const e of ledger) {
    if (e.skuName.toLowerCase() !== key || e.qtyIn >= 0 || !e.timestamp) continue;
    const ts = new Date(e.timestamp).getTime();
    if (ts > nowMs) continue;
    const age = nowMs - ts;
    const qty = Math.abs(e.qtyIn);
    if (age <= sevenDaysMs) {
      last7 += qty;
    } else if (age <= 2 * sevenDaysMs) {
      prior7 += qty;
    }
  }

  if (last7 > prior7) return 'UP';
  if (last7 < prior7) return 'DOWN';
  return 'FLAT';
}

// ============================================================================
// ROUTE HANDLER
// ============================================================================

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const entParam = searchParams.get('ent')?.toUpperCase();
    const validEntities = ['BBB', 'BBT', 'ALL'] as const;
    const entity: EntityFilter = validEntities.includes(entParam as any)
      ? (entParam as EntityFilter)
      : 'BBB';

    const [lots, catalog, ledger] = await Promise.all([
      getInventoryLots(),
      getCatalog(),
      getLedger(),
    ]);

    // Filter by entity (same logic as the calculator API).
    const filteredCatalog = catalog.filter(
      (item) => entity === 'ALL' || item.entitas === entity
    );
    const filteredLots =
      entity === 'ALL' ? lots : lots.filter((lot) => lot.entitas === entity);
    const filteredLedger =
      entity === 'ALL' ? ledger : ledger.filter((e) => e.entitas === entity);

    // Filter out inactive SKUs
    const activeCatalog = filterActiveSkus(filteredCatalog);
    const activeSkuNames = new Set(activeCatalog.map(c => c.namaBarang.toLowerCase()));
    const activeLots = filteredLots.filter(lot => activeSkuNames.has(lot.namaBarang.toLowerCase()));

    const valuation = computeValuation(activeLots, activeCatalog);
    const slowMoving = computeSlowMoving(activeLots, activeCatalog, filteredLedger);
    const velocity = computeVelocity(activeLots, activeCatalog, filteredLedger);

    return NextResponse.json({ valuation, slowMoving, velocity });
  } catch (error) {
    console.error('Inventory Report API error:', error);
    return NextResponse.json(
      { error: 'Gagal menghitung laporan inventori' },
      { status: 500 }
    );
  }
}
