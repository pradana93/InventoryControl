import { NextResponse } from 'next/server';
import { submitInbound, getWarehouse, WarehouseRack, EntityFilter } from '@/lib/google-sheets'; // Import getWarehouse and EntityFilter

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { entitas, ...inboundData } = body; // Destructure entitas from body

    // Validate required fields
    if (!entitas || (entitas !== 'BBB' && entitas !== 'BBT')) {
      return NextResponse.json(
        { error: 'Entitas wajib dipilih (BBB atau BBT)' },
        { status: 400 }
      );
    }

    if (!inboundData.namaBarang) {
      return NextResponse.json(
        { error: 'Nama Barang wajib diisi' },
        { status: 400 }
      );
    }
    
    if (!inboundData.totalQty || inboundData.totalQty <= 0) {
      return NextResponse.json(
        { error: 'Total Qty harus lebih dari 0' },
        { status: 400 }
      );
    }

    // Validate rack quantities sum equals totalQty
    const rackQtys = [
      inboundData.qtyRack1 || 0,
      inboundData.qtyRack2 || 0,
      inboundData.qtyRack3 || 0,
      inboundData.qtyRack4 || 0,
      inboundData.qtyRack5 || 0,
      inboundData.qtyRack6 || 0,
    ];
    
    const rackSum = rackQtys.reduce((sum, qty) => sum + qty, 0);
    
    if (rackSum !== inboundData.totalQty) {
      return NextResponse.json(
        { error: `Total Qty Rack (${rackSum}) harus sama dengan Total Qty Inbound (${inboundData.totalQty})` },
        { status: 400 }
      );
    }

    // Validate each rack with qty has a rack name
    const racks = [
      { rack: inboundData.rack1, qty: inboundData.qtyRack1 },
      { rack: inboundData.rack2, qty: inboundData.qtyRack2 },
      { rack: inboundData.rack3, qty: inboundData.qtyRack3 },
      { rack: inboundData.rack4, qty: inboundData.qtyRack4 },
      { rack: inboundData.rack5, qty: inboundData.qtyRack5 },
      { rack: inboundData.rack6, qty: inboundData.qtyRack6 },
    ];

    for (const r of racks) {
      if (r.qty && r.qty > 0 && !r.rack) {
        return NextResponse.json(
          { error: 'Setiap rack dengan qty harus memiliki nama rack' },
          { status: 400 }
        );
      }
    }

    // Validate racks belong to the specified entity
    const warehouse = await getWarehouse();
    const rackMap = new Map(warehouse.map(w => [w.rackId.toLowerCase(), w.entitas]));

    for (const r of racks) {
      if (r.rack && r.qty && r.qty > 0) {
        const rackEntity = rackMap.get(r.rack.toLowerCase());
        if (!rackEntity) {
          return NextResponse.json(
            { error: `Rack ${r.rack} tidak ditemukan dalam database warehouse` },
            { status: 400 }
          );
        }
        if (rackEntity !== entitas) {
          return NextResponse.json(
            { error: `Rack ${r.rack} milik entitas ${rackEntity}, tidak sesuai dengan entitas inbound ${entitas}` },
            { status: 400 }
          );
        }
      }
    }

    const result = await submitInbound({ ...inboundData, entitas });
    return NextResponse.json(result);
  } catch (error) {
    console.error('Inbound API error:', error);
    return NextResponse.json(
      { error: 'Gagal menyimpan data inbound', detail: error instanceof Error ? error.message : String(error) },
      { status: 500 }
    );
  }
}