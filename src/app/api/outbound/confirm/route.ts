import { NextResponse } from 'next/server';
import { getWarehouse, appendLedgerEntry, createPickingList } from '@/lib/google-sheets';

export const dynamic = 'force-dynamic';

/**
 * Confirm Outbound:
 * 1. Write negative qty entries to Ledger (outbound)
 * 2. Create a Picking List with RO details
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

    // Validate all allocation racks belong to the entity
    const warehouse = await getWarehouse();
    const entityRackIds = new Set(
      warehouse.filter((w) => w.entitas === entitas).map((w) => w.rackId)
    );
    for (const alloc of allocations) {
      if (!entityRackIds.has(alloc.rackId)) {
        return NextResponse.json(
          { error: `Rack ${alloc.rackId} bukan milik entitas ${entitas}` },
          { status: 400 }
        );
      }
    }

    // Generate picking list number (YYMMDD + short timestamp)
    const now = new Date();
    const dateStr =
      now.getFullYear().toString().slice(-2) +
      String(now.getMonth() + 1).padStart(2, '0') +
      String(now.getDate()).padStart(2, '0');
    const timestamp = Date.now().toString().slice(-6);
    const pickingListNo = `PL-${dateStr}-${timestamp}`;

    // 1. Write outbound entries to Ledger (negative qty)
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

    // 2. Create the picking list + items
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
      message: `Picking List ${pickingListNo} dibuat untuk RO ${roNumber} dengan ${ledgerEntries} entri.`,
    });
  } catch (error) {
    console.error('Confirm outbound error:', error);
    return NextResponse.json(
      { error: 'Gagal konfirmasi outbound', detail: error instanceof Error ? error.message : String(error) },
      { status: 500 }
    );
  }
}
