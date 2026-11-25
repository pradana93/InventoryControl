import { NextResponse } from 'next/server';
import { submitInbound, getWarehouse } from '@/lib/google-sheets';

/**
 * Public inbound endpoint used by the mobile rack-scan flow.
 * Stock Keepers scan a rack label and submit without logging in, so this route
 * is exempt from auth in proxy.ts. Input is strictly validated.
 */
export async function POST(request: Request) {
  try {
    const body = await request.json();

    if (!body.namaBarang) {
      return NextResponse.json({ error: 'Nama Barang wajib diisi' }, { status: 400 });
    }
    if (!body.totalQty || body.totalQty <= 0) {
      return NextResponse.json({ error: 'Total Qty harus lebih dari 0' }, { status: 400 });
    }
    if (!body.rack1) {
      return NextResponse.json({ error: 'Rack wajib diisi' }, { status: 400 });
    }
    if (Number(body.qtyRack1) !== Number(body.totalQty)) {
      return NextResponse.json(
        { error: `Qty rack (${body.qtyRack1}) harus sama dengan Total Qty (${body.totalQty})` },
        { status: 400 }
      );
    }

    // Determine entity from rack
    const warehouse = await getWarehouse();
    const rackInfo = warehouse.find(w => w.rackId === body.rack1);
    if (!rackInfo) {
      return NextResponse.json({ error: `Rack ${body.rack1} tidak ditemukan` }, { status: 400 });
    }
    const entitas = rackInfo.entitas === 'BBB' || rackInfo.entitas === 'BBT' ? rackInfo.entitas : 'BBB';

    const result = await submitInbound({
      entitas,
      barcode: body.barcode || '',
      namaBarang: body.namaBarang,
      totalQty: Number(body.totalQty),
      tanggalInbound: body.tanggalInbound,
      tanggalKadaluarsa: body.tanggalKadaluarsa,
      nomorSJ: body.nomorSJ || '',
      rack1: body.rack1,
      qtyRack1: Number(body.qtyRack1),
      remarks: body.remarks || 'Scan inbound',
    });

    return NextResponse.json(result);
  } catch (error) {
    console.error('Scan inbound error:', error);
    return NextResponse.json(
      { error: 'Gagal menyimpan data inbound', detail: error instanceof Error ? error.message : String(error) },
      { status: 500 }
    );
  }
}