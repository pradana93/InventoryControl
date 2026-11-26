import { NextResponse } from 'next/server';
import { getLedger, getWarehouse, getCatalog, EntityFilter } from '@/lib/google-sheets';

export const dynamic = 'force-dynamic';

// Zone ordering for the picker walking path. Lower = picked first.
const ZONE_ORDER: Record<string, number> = {
  RACKING: 1,
  FLOOR: 2,
  CONTAINER: 3,
  FREEZER: 4,
};

function zoneRank(zone: string): number {
  return ZONE_ORDER[(zone || '').toUpperCase()] ?? 99;
}

/**
 * Parse an ISO (YYYY-MM-DD) expiry into a comparable timestamp.
 * Invalid / missing dates sort last so they are only picked after real lots.
 */
function expiryTime(expiredDate: string): number {
  if (!expiredDate) return Number.POSITIVE_INFINITY;
  const t = new Date(expiredDate + 'T00:00:00').getTime();
  return isNaN(t) ? Number.POSITIVE_INFINITY : t;
}

function daysToExpiry(expiredDate: string): number {
  const t = expiryTime(expiredDate);
  if (!isFinite(t)) return 9999;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return Math.round((t - today.getTime()) / 86400000);
}

function fefoLabel(days: number): string {
  if (days === 9999) return '-';
  if (days < 0) return 'EXPIRED';
  if (days === 0) return 'HARI INI';
  if (days <= 7) return 'KRITIS';
  if (days <= 30) return 'SEGERA';
  return 'OK';
}

/**
 * FEFO Allocation + Rack Sequencing Engine
 *
 * Enforces First-Expired-First-Out: each requested SKU is allocated from its
 * lots in ascending expiry order (earliest expiry consumed first), then the
 * resulting pick points are sequenced along the warehouse walking path
 * (zone order, then rack id natural order).
 *
 * Input:  { lines: [{ skuName, qtyOrdered, matchedSkuId }], entitas: 'BBB' | 'BBT' }
 * Output: {
 *   allocations: [{ rackId, skuName, qtyAllocated, expiredDate, expiredLabel,
 *                   daysToExpiry, fefoStatus, zone, sequence }],
 *   shortages:   [{ skuName, requested, allocated, short }],
 *   fefoOrder:   [{ skuName, lots: [{ rackId, expiredDate, expiredLabel }] }]
 * }
 */
export async function POST(request: Request) {
  try {
    const body = await request.json();
    const lines = body.lines || [];
    const entitas = body.entitas as 'BBB' | 'BBT' | undefined;

    if (!lines.length) {
      return NextResponse.json({ error: 'Tidak ada baris untuk dialokasikan' }, { status: 400 });
    }

    if (!entitas || (entitas !== 'BBB' && entitas !== 'BBT')) {
      return NextResponse.json({ error: 'Entitas wajib dipilih (BBB atau BBT)' }, { status: 400 });
    }

    // Fetch all data
    const [allLedger, allWarehouse] = await Promise.all([
      getLedger(),
      getWarehouse(),
    ]);

    // Filter to the entity's racks
    const entityWarehouse = allWarehouse.filter(w => w.entitas === entitas);
    const entityRackIds = new Set(entityWarehouse.map(w => w.rackId));

    const ledger = allLedger.filter(e =>
      (e.entitas === entitas) || entityRackIds.has(e.rackId)
    );
    const warehouse = entityWarehouse;

    // Build active stock lot-by-lot, netting inbound (positive) against
    // outbound (negative) so repeat runs never over-allocate.
    // Key: SKU + Rack + Expiry identifies a "lot".
    interface Lot { rackId: string; skuName: string; qty: number; expiredDate: string; expiredLabel: string; }
    const lotMap = new Map<string, Lot>();

    // Sort ledger oldest-first so outbound consumes the same lots FEFO would pick.
    const sortedLedger = [...ledger].sort((a, b) => {
      const da = new Date(a.timestamp || 0).getTime();
      const db = new Date(b.timestamp || 0).getTime();
      return da - db;
    });

    for (const entry of sortedLedger) {
      const key = `${entry.skuName.toLowerCase()}|${entry.rackId}|${entry.expiredDate || ''}`;
      if (!lotMap.has(key)) {
        lotMap.set(key, {
          rackId: entry.rackId,
          skuName: entry.skuName,
          qty: 0,
          expiredDate: entry.expiredDate,
          expiredLabel: formatDateShort(entry.expiredDate),
        });
      }
      const lot = lotMap.get(key)!;
      // qtyIn is positive for inbound, negative for outbound (see confirm route).
      lot.qty += Number(entry.qtyIn) || 0;
    }

    // Only keep lots that still have stock on hand.
    const stockLots = Array.from(lotMap.values()).filter(l => l.qty > 0);

    // Aggregate by SKU -> array of lots
    const skuLots = new Map<string, Array<Lot>>();

    for (const lot of stockLots) {
      const key = lot.skuName.toLowerCase();
      if (!skuLots.has(key)) skuLots.set(key, []);
      skuLots.get(key)!.push(lot);
    }

    // FEFO: sort each SKU's lots by strict expiry ascending (earliest first).
    // Tie-break by rack id so the pick path is deterministic.
    for (const lots of skuLots.values()) {
      lots.sort((a, b) => {
        const ta = expiryTime(a.expiredDate);
        const tb = expiryTime(b.expiredDate);
        if (ta !== tb) return ta - tb;
        return a.rackId.localeCompare(b.rackId);
      });
    }

    const warehouseMap = new Map(warehouse.map(w => [w.rackId, w.jenisLokasi]));

    interface Allocation {
      rackId: string;
      skuName: string;
      qtyAllocated: number;
      expiredDate: string;
      expiredLabel: string;
      daysToExpiry: number;
      fefoStatus: string;
      zone: string;
      sequence: number;
    }

    const allocations: Allocation[] = [];
    const shortages: Array<{ skuName: string; requested: number; allocated: number; short: number }> = [];
    const fefoOrder: Array<{ skuName: string; lots: Array<{ rackId: string; expiredDate: string; expiredLabel: string; qty: number }> }> = [];

    // Process each requested line, consuming earliest-expiry lots first.
    for (const line of lines) {
      const skuKey = String(line.skuName || '').toLowerCase();
      const availableLots = skuLots.get(skuKey) || [];
      let remaining = Number(line.qtyOrdered) || 0;
      const requested = remaining;
      let allocatedForLine = 0;

      // Record the full FEFO order for this SKU (for review / audit).
      if (availableLots.length > 0) {
        fefoOrder.push({
          skuName: line.skuName,
          lots: availableLots.map(l => ({
            rackId: l.rackId,
            expiredDate: l.expiredDate,
            expiredLabel: l.expiredLabel,
            qty: l.qty,
          })),
        });
      }

      if (availableLots.length === 0) {
        console.warn(`No stock for SKU: ${line.skuName}`);
        shortages.push({ skuName: line.skuName, requested, allocated: 0, short: requested });
        continue;
      }

      // Allocate from earliest expiry first
      for (const lot of availableLots) {
        if (remaining <= 0) break;
        const take = Math.min(remaining, lot.qty);

        if (take > 0) {
          const dte = daysToExpiry(lot.expiredDate);
          allocations.push({
            rackId: lot.rackId,
            skuName: line.skuName,
            qtyAllocated: take,
            expiredDate: lot.expiredDate,
            expiredLabel: lot.expiredLabel,
            daysToExpiry: dte,
            fefoStatus: fefoLabel(dte),
            zone: warehouseMap.get(lot.rackId) || 'UNKNOWN',
            sequence: 0, // renumbered after sorting
          });
          lot.qty -= take;
          remaining -= take;
          allocatedForLine += take;
        }
      }

      if (remaining > 0) {
        console.warn(`Partial allocation for ${line.skuName}: short by ${remaining}`);
        shortages.push({
          skuName: line.skuName,
          requested,
          allocated: allocatedForLine,
          short: remaining,
        });
      }
    }

    // Sequence along the picking path: zone order, then rack id natural order.
    // rack id natural order handles e.g. A01-1 < A01-2 < A01-10 correctly.
    const rackCollator = new Intl.Collator('en', { numeric: true, sensitivity: 'base' });
    allocations.sort((a, b) => {
      const zoneA = zoneRank(a.zone);
      const zoneB = zoneRank(b.zone);
      if (zoneA !== zoneB) return zoneA - zoneB;
      return rackCollator.compare(a.rackId, b.rackId);
    });

    // Re-number sequence after sorting (1-based pick order).
    allocations.forEach((a, i) => { a.sequence = i + 1; });

    return NextResponse.json({ allocations, shortages, fefoOrder });
  } catch (error) {
    console.error('Allocation error:', error);
    return NextResponse.json(
      { error: 'Gagal alokasi', detail: error instanceof Error ? error.message : String(error) },
      { status: 500 }
    );
  }
}

function formatDateShort(iso: string): string {
  if (!iso) return '-';
  const d = new Date(iso + 'T00:00:00');
  if (isNaN(d.getTime())) return iso;
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  return `${d.getDate()} ${months[d.getMonth()]} ${d.getFullYear()}`;
}
