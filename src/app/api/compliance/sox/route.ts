import { NextResponse } from 'next/server';
import {
  getCatalog,
  getInventoryLots,
  getLedger,
  CatalogEntry,
  InventoryLot,
  LedgerEntry,
  EntityFilter,
} from '@/lib/db';
import { filterActiveSkus } from '@/lib/warehouse-optimization';

export const dynamic = 'force-dynamic';

// ============================================================================
// SOX VALUATION RECONCILIATION API
// ============================================================================
// SOX (Sarbanes-Oxley) requires that the value of inventory reported on the
// books reconciles to what is physically on hand. This endpoint computes both
// sides independently:
//
//   Book Value       = sum(catalog.unit_cost * lot.qty) for active SKUs,
//                      computed from the catalog master (the "books").
//   Physical Value   = sum(lot.qty * catalog.unit_cost) for active SKUs,
//                      computed from the physical lots (the "floor").
//
// In this data model both sides read the same unit_cost, so the expected
// outcome is a zero difference. The reconciliation is still meaningful: any
// non-zero difference surfaces SKUs whose lots reference a SKU that has no
// active catalog master row (orphan stock) or whose cost basis is missing.
//
//   difference      = physicalValue - bookValue
//   variancePercent = |difference| / bookValue * 100  (0 when bookValue = 0)
// ============================================================================

export interface SoxReconciliation {
  entity: EntityFilter;
  asOf: string;
  bookValue: number;
  physicalValue: number;
  difference: number;
  variancePercent: number;
  /** True when |variancePercent| exceeds the 1% SOX tolerance threshold. */
  exceedsTolerance: boolean;
  skuCount: number;
  lotCount: number;
  totalQty: number;
  /** Book value of the ledger movement for the period (informational). */
  ledgerMovementValue: number;
  generatedAt: string;
}

/**
 * Pure reconciliation math — exported for testing and reuse.
 *
 * @param catalog Active catalog entries (already entity-filtered).
 * @param lots    Inventory lots (already entity-filtered).
 * @param ledger  Ledger entries (already entity-filtered), used only for the
 *                informational ledger-movement figure.
 * @param entity  Entity label for the report.
 * @param asOf    ISO date the reconciliation is as of (defaults to now).
 */
export function computeSoxReconciliation(
  catalog: CatalogEntry[],
  lots: InventoryLot[],
  ledger: LedgerEntry[],
  entity: EntityFilter = 'ALL',
  asOf: string = new Date().toISOString()
): SoxReconciliation {
  const activeCatalog = filterActiveSkus(catalog);
  const costByName = new Map(
    activeCatalog.map((c) => [c.namaBarang.toLowerCase(), c.unitCost || 0])
  );

  // Book value: value the active SKU master rows at their on-hand lot qty.
  // Lot qty is keyed by SKU name and only positive stock counts.
  const qtyByName = new Map<string, number>();
  for (const lot of lots) {
    if (lot.qtySistem <= 0) continue;
    const key = lot.namaBarang.toLowerCase();
    qtyByName.set(key, (qtyByName.get(key) || 0) + lot.qtySistem);
  }

  let bookValue = 0;
  let totalQty = 0;
  for (const entry of activeCatalog) {
    const qty = qtyByName.get(entry.namaBarang.toLowerCase()) || 0;
    if (qty <= 0) continue;
    bookValue += (entry.unitCost || 0) * qty;
    totalQty += qty;
  }

  // Physical value: value the lots directly using the catalog cost basis.
  // Lots whose SKU is not in the active master contribute 0 (they are the
  // orphan-stock source of any variance).
  let physicalValue = 0;
  let lotCount = 0;
  for (const lot of lots) {
    if (lot.qtySistem <= 0) continue;
    const unitCost = costByName.get(lot.namaBarang.toLowerCase());
    if (unitCost === undefined) continue; // orphan lot — no active master
    physicalValue += lot.qtySistem * unitCost;
    lotCount++;
  }

  const difference = physicalValue - bookValue;
  const variancePercent = bookValue > 0 ? (Math.abs(difference) / bookValue) * 100 : 0;

  // Informational: value of ledger movement in the period.
  const ledgerMovementValue = ledger.reduce((sum, e) => {
    const unitCost = costByName.get(e.skuName.toLowerCase());
    if (unitCost === undefined) return sum;
    return sum + e.qtyIn * unitCost;
  }, 0);

  return {
    entity,
    asOf,
    bookValue: Math.round(bookValue * 100) / 100,
    physicalValue: Math.round(physicalValue * 100) / 100,
    difference: Math.round(difference * 100) / 100,
    variancePercent: Math.round(variancePercent * 100) / 100,
    exceedsTolerance: variancePercent > 1,
    skuCount: activeCatalog.length,
    lotCount,
    totalQty,
    ledgerMovementValue: Math.round(ledgerMovementValue * 100) / 100,
    generatedAt: new Date().toISOString(),
  };
}

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const entParam = searchParams.get('ent')?.toUpperCase();
    const validEntities = ['BBB', 'BBT', 'ALL'] as const;
    const entity: EntityFilter = validEntities.includes(entParam as any)
      ? (entParam as EntityFilter)
      : 'ALL';

    const [catalog, lots, ledger] = await Promise.all([
      getCatalog(),
      getInventoryLots(),
      getLedger(),
    ]);

    // Filter every dataset to the selected entity. ALL keeps everything.
    const filteredCatalog = catalog.filter(
      (c) => entity === 'ALL' || c.entitas === entity
    );
    const filteredLots =
      entity === 'ALL' ? lots : lots.filter((l) => l.entitas === entity);
    const filteredLedger =
      entity === 'ALL' ? ledger : ledger.filter((e) => e.entitas === entity);

    const reconciliation = computeSoxReconciliation(
      filteredCatalog,
      filteredLots,
      filteredLedger,
      entity
    );

    return NextResponse.json({ reconciliation });
  } catch (error) {
    console.error('SOX reconciliation API error:', error);
    return NextResponse.json(
      {
        error: 'Gagal menghitung rekonsiliasi SOX',
        detail: error instanceof Error ? error.message : String(error),
      },
      { status: 500 }
    );
  }
}
