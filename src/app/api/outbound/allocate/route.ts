import { NextResponse } from 'next/server';
import { getLedger, getWarehouse, getCatalog } from '@/lib/google-sheets';

export const dynamic = 'force-dynamic';

/**
 * FEFO Allocation + Rack Sequencing Engine
 * 
 * Input: { lines: [{ skuName, qtyOrdered, matchedSkuId }] }
 * Output: { allocations: [{ rackId, skuName, qtyAllocated, expiredDate, zone, sequence }] }
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
    const [allLedger, allWarehouse, catalog] = await Promise.all([
      getLedger(),
      getWarehouse(),
      getCatalog(),
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

    // Aggregate by SKU -> Rack -> Expiry
    const skuRackExpiry = new Map<string, Array<{
      rackId: string;
      qty: number;
      expiredDate: string;
      expiredLabel: string;
    }>>();

    for (const lot of stockLots) {
      const key = lot.skuName.toLowerCase();
      if (!skuRackExpiry.has(key)) skuRackExpiry.set(key, []);
      skuRackExpiry.get(key)!.push({
        rackId: lot.rackId,
        qty: lot.qty,
        expiredDate: lot.expiredDate,
        expiredLabel: lot.expiredLabel,
      });
    }

    // Sort each SKU's lots by expiry ASC (FEFO)
    for (const lots of skuRackExpiry.values()) {
      lots.sort((a, b) => (a.expiredDate || '').localeCompare(b.expiredDate || ''));
    }

    // Zone ordering for rack sequencing
    const zoneOrder: Record<string, number> = {
      'RACKING': 1,
      'FLOOR': 2,
      'CONTAINER': 3,
      'FREEZER': 4,
    };

    // Warehouse map for zone lookup
    const warehouseMap = new Map(warehouse.map(w => [w.rackId, w.jenisLokasi]));

    const allocations = [];
    let globalSequence = 1;

    // Process each requested line
    for (const line of lines) {
      const skuKey = line.skuName.toLowerCase();
      const availableLots = skuRackExpiry.get(skuKey) || [];
      let remaining = line.qtyOrdered;

      if (availableLots.length === 0) {
        console.warn(`No stock for SKU: ${line.skuName}`);
        continue;
      }

      // Allocate from earliest expiry first
      for (const lot of availableLots) {
        if (remaining <= 0) break;
        const take = Math.min(remaining, lot.qty);
        
        if (take > 0) {
          allocations.push({
            rackId: lot.rackId,
            skuName: line.skuName,
            qtyAllocated: take,
            expiredDate: lot.expiredDate,
            expiredLabel: lot.expiredLabel,
            zone: warehouseMap.get(lot.rackId) || 'UNKNOWN',
            sequence: globalSequence++,
          });
          lot.qty -= take;
          remaining -= take;
        }
      }

      if (remaining > 0) {
        console.warn(`Partial allocation for ${line.skuName}: short by ${remaining}`);
      }
    }

    // Sort allocations by zone order, then rack ID (picking path)
    allocations.sort((a, b) => {
      const zoneA = zoneOrder[a.zone] || 99;
      const zoneB = zoneOrder[b.zone] || 99;
      if (zoneA !== zoneB) return zoneA - zoneB;
      return a.rackId.localeCompare(b.rackId);
    });

    // Re-number sequence after sorting
    allocations.forEach((a, i) => { a.sequence = i + 1; });

    return NextResponse.json({ allocations });
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