import { NextResponse } from 'next/server';
import { submitInbound } from '@/lib/google-sheets';

export async function POST(request: Request) {
  try {
    const body = await request.json();
    
    // Validate required fields
    if (!body.namaBarang) {
      return NextResponse.json(
        { error: 'Nama Barang wajib diisi' },
        { status: 400 }
      );
    }
    
    if (!body.totalQty || body.totalQty <= 0) {
      return NextResponse.json(
        { error: 'Total Qty harus lebih dari 0' },
        { status: 400 }
      );
    }

    // Validate rack quantities sum equals totalQty
    const rackQtys = [
      body.qtyRack1 || 0,
      body.qtyRack2 || 0,
      body.qtyRack3 || 0,
      body.qtyRack4 || 0,
      body.qtyRack5 || 0,
      body.qtyRack6 || 0,
    ];
    
    const rackSum = rackQtys.reduce((sum, qty) => sum + qty, 0);
    
    if (rackSum !== body.totalQty) {
      return NextResponse.json(
        { error: `Total Qty Rack (${rackSum}) harus sama dengan Total Qty Inbound (${body.totalQty})` },
        { status: 400 }
      );
    }

    // Validate each rack with qty has a rack name
    const racks = [
      { rack: body.rack1, qty: body.qtyRack1 },
      { rack: body.rack2, qty: body.qtyRack2 },
      { rack: body.rack3, qty: body.qtyRack3 },
      { rack: body.rack4, qty: body.qtyRack4 },
      { rack: body.rack5, qty: body.qtyRack5 },
      { rack: body.rack6, qty: body.qtyRack6 },
    ];

    for (const r of racks) {
      if (r.qty && r.qty > 0 && !r.rack) {
        return NextResponse.json(
          { error: 'Setiap rack dengan qty harus memiliki nama rack' },
          { status: 400 }
        );
      }
    }

    const result = await submitInbound(body);
    return NextResponse.json(result);
  } catch (error) {
    console.error('Inbound API error:', error);
    return NextResponse.json(
      { error: 'Gagal menyimpan data inbound' },
      { status: 500 }
    );
  }
}