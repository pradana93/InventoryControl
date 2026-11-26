import { NextResponse } from 'next/server';
import { updateStockOpnameSOH, syncStockOpnameWithSystem, getStockOpname, getWarehouse, EntityFilter, seedUnitCost, getCatalog, getInventoryLots } from '@/lib/google-sheets';

export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const action = searchParams.get('action');
    const entParam = searchParams.get('ent')?.toUpperCase();
    const entity: EntityFilter = (entParam === 'BBB' || entParam === 'BBT' || entParam === 'ALL') ? entParam : 'BBB';

    switch (action) {
      case 'list': {
        const [inventoryLots, warehouse, catalog] = await Promise.all([
          getInventoryLots(),
          getWarehouse(),
          getCatalog(),
        ]);

        // Map catalog unit cost by lowercase SKU name
        const costMap = new Map(catalog.map(c => [c.namaBarang.toLowerCase(), c.unitCost]));

        // Filter inventory lots by entity
        const entityWarehouse = entity && entity !== 'ALL'
          ? warehouse.filter(w => w.entitas === entity)
          : warehouse;
        const entityRackIds = new Set(entityWarehouse.map(w => w.rackId));

        const filteredAndMapped = inventoryLots
          .filter(l => entityRackIds.has(l.nomorRak))
          .map(l => {
            const unitCost = costMap.get(l.namaBarang.toLowerCase()) || 0;
            const variance = l.soh - l.qtySistem; // already calculated by getInventoryLots
            const selisihRp = variance * unitCost;

            // Determine tolerance status
            const absVariance = Math.abs(variance);
            const akurasiPct = l.qtySistem > 0 ? (l.soh / l.qtySistem) * 100 : 100;
            const accuracyDiff = 100 - akurasiPct;
            let toleranceStatus: 'Akurat' | 'Toleransi' | 'Selisih';
            if (absVariance === 0) {
              toleranceStatus = 'Akurat';
            } else if (absVariance <= 1 || accuracyDiff <= 1.0) {
              toleranceStatus = 'Toleransi';
            } else {
              toleranceStatus = 'Selisih';
            }

            return {
              rackId: l.nomorRak,
              skuName: l.namaBarang,
              qtySistem: l.qtySistem,
              qtyFisikSOH: l.soh,
              variance: variance,
              selisihRp: selisihRp,
              toleranceStatus: toleranceStatus as 'Akurat' | 'Toleransi' | 'Selisih',
              akurasi: `${l.akurasi.toFixed(2)}%`,
              tanggalOpname: l.tanggalInbound, // Using inbound date for simplicity, can be updated later
              petugas: '', // Will be populated from stock_opname table during actual save
              catatan: '', // Will be populated from stock_opname table during actual save
              unitCost: unitCost,
            };
          });

        return NextResponse.json(filteredAndMapped);
      }

      case 'sync': {
        await syncStockOpnameWithSystem();
        return NextResponse.json({ success: true, message: 'Stock Opname synchronized with system quantities.' });
      }

      case 'seed-cost': {
        const result = await seedUnitCost();
        return NextResponse.json({ success: true, message: 'Unit costs seeded successfully.', result });
      }

      default:
        return NextResponse.json({ error: 'Invalid action' }, { status: 400 });
    }
  } catch (error) {
    console.error('Stock Opname API error:', error);
    return NextResponse.json(
      { error: 'Failed to fetch stock opname data' },
      { status: 500 }
    );
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json();

    // Validate required fields
    if (!body.rackId) {
      return NextResponse.json(
        { error: 'Rack ID wajib diisi' },
        { status: 400 }
      );
    }
    if (!body.skuName) {
      return NextResponse.json(
        { error: 'Nama SKU wajib diisi' },
        { status: 400 }
      );
    }
    if (body.qtyFisikSOH === undefined || body.qtyFisikSOH === null) {
      return NextResponse.json(
        { error: 'Qty Fisik (SOH) wajib diisi' },
        { status: 400 }
      );
    }

    // Validate rack belongs to entity (if provided)
    if (body.entitas) {
      const warehouse = await getWarehouse();
      const rackInfo = warehouse.find(w => w.rackId === body.rackId);
      if (rackInfo && rackInfo.entitas !== body.entitas) {
        return NextResponse.json(
          { error: `Rack ${body.rackId} bukan milik entitas ${body.entitas}` },
          { status: 400 }
        );
      }
    }

    await updateStockOpnameSOH(
      body.rackId,
      body.skuName,
      Number(body.qtyFisikSOH),
      body.petugas || '',
      body.catatan || ''
    );

    return NextResponse.json({ 
      success: true, 
      message: 'Stock Opname (SOH) berhasil disimpan.' 
    });
  } catch (error) {
    console.error('Stock Opname update error:', error);
    return NextResponse.json(
      { error: 'Gagal menyimpan Stock Opname' },
      { status: 500 }
    );
  }
}