import { NextResponse } from 'next/server';
import { updateStockOpnameSOH, syncStockOpnameWithSystem, getStockOpname } from '@/lib/google-sheets';

export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const action = searchParams.get('action');

    switch (action) {
      case 'list':
        const opname = await getStockOpname();
        return NextResponse.json(opname);

      case 'sync':
        await syncStockOpnameWithSystem();
        return NextResponse.json({ success: true, message: 'Stock Opname synchronized with system quantities.' });

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