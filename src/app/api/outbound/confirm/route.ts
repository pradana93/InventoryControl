import { NextResponse } from 'next/server';
import { getLedger, getWarehouse, appendLedgerEntry, createPickingList } from '@/lib/google-sheets';

export const dynamic = 'force-dynamic';

/**
 * Strict expiry date comparison.
 * Returns timestamp in ms for sorting; invalid dates = +Infinity (sort last).
 */
function expiryTime(expiredDate: string | undefined): number {
  if (!expiredDate) return Number.POSITIVE_INFINITY;
  const t = new Date(expiredDate + 'T00:00:00').getTime();
  return isNaN(t) ? Number.POSITIVE_INFINITY : t;
}

/**
 * Confirm Outbound with FEFO enforcement:
 * 1. Verify all allocation racks belong to the entity.
 * 2. For each SKU in the request, check that the chosen lots follow FEFO:
 *    - No available lot of the same SKU with an EARLIER expiry date
 *      may remain unpicked (qty > 0) while a later lot is being picked.
 * 3. Verify each requested qty does not exceed available stock in that lot.
 * 4. If any violation -> HTTP 400 with explicit Indonesian message.
 * 5. If all OK -> write negative ledger entries + create picking list.
 */
export async function POST(request: Request) {
  try {
    const body = await request.json();
    const allocations = body.allocations || [];
    const roNumber = body.roNumber?.trim() || '';
    const customer = body.customer?.trim() || '';
    const branch = body.branch?.trim() || '';
    const roDate = body.roDate?.trim() || new Date().toISOString().slice(0, 10);
    const entitas = body.entitas as 'BBB' | 'BBT' | undefined;

    if (!allocations.length) {
      return NextResponse.json({ error: 'Tidak ada alokasi untuk dikonfirmasi' }, { status: 400 });
    }
    if (!roNumber) {
      return NextResponse.json({ error: 'RO Number wajib diisi' }, { status: 400 });
    }
    if (!entitas || (entitas !== 'BBB' && entitas !== 'BBT')) {
      return NextResponse.json({ error: 'Entitas wajib dipilih (BBB atau BBT)' }, { status: 400 });
    }

    // --- Fetch current warehouse & ledger ---
    const [allLedger, allWarehouse] = await Promise.all([
      getLedger(),
      getWarehouse(),
    ]);

    const entityWarehouse = allWarehouse.filter(w => w.entitas === entitas);
    const entityRackIds = new Set(entityWarehouse.map(w => w.rackId));

    // Validate all allocation racks belong to the entity
    for (const alloc of allocations) {
      if (!entityRackIds.has(alloc.rackId)) {
        return NextResponse.json(
          { error: `Rack ${alloc.rackId} bukan milik entitas ${entitas}` },
          { status: 400 }
        );
      }
    }

    // --- Build current available stock per (SKU, Rack, Expiry) ---
    interface Lot {
      rackId: string;
      skuName: string;
      qty: number;
      expiredDate: string;
    }
    const lotMap = new Map<string, Lot>();

    const entityLedger = allLedger.filter(e =>
      (e.entitas === entitas) || entityRackIds.has(e.rackId)
    );

    // Oldest-first so later outbound entries correctly consume FEFO lots.
    const sortedLedger = [...entityLedger].sort((a, b) => {
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
        });
      }
      const lot = lotMap.get(key)!;
      lot.qty += Number(entry.qtyIn) || 0;
    }

    // Only keep lots with stock on hand
    const stockLots = Array.from(lotMap.values()).filter(l => l.qty > 0);

    // Group by SKU for FEFO violation detection
    const skuLots = new Map<string, Lot[]>();
    for (const lot of stockLots) {
      const key = lot.skuName.toLowerCase();
      if (!skuLots.has(key)) skuLots.set(key, []);
      skuLots.get(key)!.push(lot);
    }

    // Sort each SKU's lots by strict FEFO (earliest expiry first)
    for (const lots of skuLots.values()) {
      lots.sort((a, b) => {
        const ta = expiryTime(a.expiredDate);
        const tb = expiryTime(b.expiredDate);
        if (ta !== tb) return ta - tb;
        return a.rackId.localeCompare(b.rackId);
      });
    }

    // --- FEFO Compliance Check ---
    // For each allocation, ensure no earlier lot of the same SKU was skipped.
    // Also check qty does not exceed available in that specific lot.
    for (const alloc of allocations) {
      const skuKey = String(alloc.skuName || '').toLowerCase();
      const lots = skuLots.get(skuKey) || [];
      const allocExpTime = expiryTime(alloc.expiredDate);
      const allocRack = alloc.rackId;
      const allocQty = Number(alloc.qtyAllocated) || 0;

      // Find the matching lot in our computed stock
      const matchingLot = lots.find(l => l.rackId === allocRack && expiryTime(l.expiredDate) === allocExpTime);

      if (!matchingLot) {
        return NextResponse.json({
          error: `Pelanggaran FEFO: Lot untuk SKU "${alloc.skuName}" di rak ${allocRack} (Exp: ${alloc.expiredDate || 'tidak ada'}) tidak ditemukan di stok sistem.`,
          violation: { type: 'LOT_NOT_FOUND', sku: alloc.skuName, rack: allocRack, expiredDate: alloc.expiredDate }
        }, { status: 400 });
      }

      // Qty check
      if (allocQty > matchingLot.qty) {
        return NextResponse.json({
          error: `Stok tidak mencukupi untuk SKU "${alloc.skuName}" di rak ${allocRack} (Tersedia: ${matchingLot.qty}, Diminta: ${allocQty}).`,
          violation: { type: 'INSUFFICIENT_STOCK', sku: alloc.skuName, rack: allocRack, available: matchingLot.qty, requested: allocQty }
        }, { status: 400 });
      }

      // FEFO violation check: is there ANY earlier lot (lower expiryTime) with qty > 0 that was NOT fully picked?
      for (const lot of lots) {
        const lotExpTime = expiryTime(lot.expiredDate);
        if (lotExpTime < allocExpTime && lot.qty > 0) {
          // There is an earlier-expiring lot with stock still on hand.
          return NextResponse.json({
            error: `Pelanggaran FEFO: SKU "${alloc.skuName}" pada rak ${allocRack} (Exp: ${alloc.expiredDate || 'tidak ada'}) tidak dapat diambil sebelum stok yang lebih awal kedaluwarsa di rak ${lot.rackId} (Exp: ${lot.expiredDate || 'tidak ada'}, Sisa: ${lot.qty}) habis diambil.`,
            violation: {
              type: 'FEFO_SKIPPED_EARLIER',
              sku: alloc.skuName,
              attemptedRack: allocRack,
              attemptedExpiry: alloc.expiredDate,
              earlierRack: lot.rackId,
              earlierExpiry: lot.expiredDate,
              earlierQty: lot.qty,
            }
          }, { status: 400 });
        }
      }
    }

    // --- Generate picking list number (YYMMDD + short timestamp) ---
    const now = new Date();
    const dateStr =
      now.getFullYear().toString().slice(-2) +
      String(now.getMonth() + 1).padStart(2, '0') +
      String(now.getDate()).padStart(2, '0');
    const timestamp = Date.now().toString().slice(-6);
    const pickingListNo = `PL-${dateStr}-${timestamp}`;

    // --- 1. Write outbound entries to Ledger (negative qty) ---
    let ledgerEntries = 0;
    for (const alloc of allocations) {
      await appendLedgerEntry({
        recordId: `REC-OUT-${Date.now()}-${ledgerEntries}`,
        timestamp: new Date().toISOString(),
        skuName: alloc.skuName,
        rackId: alloc.rackId,
        qtyIn: -alloc.qtyAllocated, // NEGATIVE for outbound
        expiredDate: alloc.expiredDate,
        sjNumber: pickingListNo,
        remarks: `Outbound via ${pickingListNo} (RO: ${roNumber})`,
        entitas,
      });
      ledgerEntries++;
    }

    // --- 2. Create the picking list + items ---
    await createPickingList({
      pickingListNo,
      roNumber,
      customer,
      branch,
      roDate,
      entitas,
      allocations,
    });

    return NextResponse.json({
      success: true,
      pickingListNo,
      ledgerEntries,
      roNumber,
      customer,
      branch,
      roDate,
      message: `Picking List ${pickingListNo} dibuat untuk RO ${roNumber} dengan ${ledgerEntries} entri (FEFO validated).`,
    });
  } catch (error) {
    console.error('Confirm outbound error:', error);
    return NextResponse.json(
      { error: 'Gagal konfirmasi outbound', detail: error instanceof Error ? error.message : String(error) },
      { status: 500 }
    );
  }
}