import { NextResponse } from 'next/server';
import { updateStockOpnameSOH, syncStockOpnameWithSystem, getStockOpname, getWarehouse, EntityFilter } from '@/lib/google-sheets';

export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const action = searchParams.get('action');
    const entParam = searchParams.get('ent')?.toUpperCase();
    const entity: EntityFilter = (entParam === 'BBB' || entParam === 'BBT' || entParam === 'ALL') ? entParam : 'BBB';

    switch (action) {
      case 'list': {
        const [opname, warehouse] = await Promise.all([
          getStockOpname(),
          getWarehouse(),
        ]);

        // Filter by entity
        const entityWarehouse = entity && entity !== 'ALL'
          ? warehouse.filter(w => w.entitas === entity)
          : warehouse;
        const entityRackIds = new Set(entityWarehouse.map(w => w.rackId));

        const filtered = opname.filter(o => entityRackIds.has(o.rackId));
        return NextResponse.json(filtered);
      }

      case 'sync': {
        await syncStockOpnameWithSystem();
        return NextResponse.json({ success: true, message: 'Stock Opname synchronized with system quantities.' });
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