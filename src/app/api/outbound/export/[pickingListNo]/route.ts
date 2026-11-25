import { NextResponse } from 'next/server';
import { readSheet } from '@/lib/google-sheets';
import * as XLSX from 'xlsx';

export const dynamic = 'force-dynamic';

/**
 * Export Picking List to Excel (.xlsx)
 * Format: Header block (RO details) + Picking table
 */
export async function GET(
  request: Request,
  { params }: { params: Promise<{ pickingListNo: string }> }
) {
  try {
    const { pickingListNo } = await params;
    
    // Read Picking List sheet
    const allRows = await readSheet('Picking_List');
    
    if (allRows.length <= 1) {
      return NextResponse.json({ error: 'Picking List kosong' }, { status: 404 });
    }

    const header = allRows[0].map(h => String(h).trim());
    
    // Find column indices (flexible matching)
    const findIdx = (names: string[]) => {
      for (const name of names) {
        const idx = header.findIndex(h => h.toLowerCase() === name.toLowerCase());
        if (idx !== -1) return idx;
      }
      return -1;
    };

    const plNoIdx = findIdx(['Picking_List_No', 'PickingListNo', 'PL_No']);
    const roIdx = findIdx(['RO_Number', 'RONumber', 'RO_No']);
    const custIdx = findIdx(['Customer']);
    const branchIdx = findIdx(['Branch']);
    const roDateIdx = findIdx(['RO_Date', 'RODate']);
    const rackIdx = findIdx(['Rack_ID', 'RackId', 'Rack']);
    const skuIdx = findIdx(['SKU_Name', 'SKUName', 'SKU']);
    const qtyIdx = findIdx(['Qty_Pick', 'QtyPick', 'Qty']);
    const expIdx = findIdx(['Expired_Date', 'ExpiredDate', 'Expiry']);
    const zoneIdx = findIdx(['Zone', 'Zona']);
    const seqIdx = findIdx(['Sequence', 'Seq']);

    if (plNoIdx === -1) {
      return NextResponse.json({ error: 'Format sheet tidak dikenali: kolom Picking_List_No tidak ditemukan' }, { status: 500 });
    }

    const matchingRows = allRows.slice(1).filter(row => String(row[plNoIdx] || '').trim() === pickingListNo.trim());
    
    if (matchingRows.length === 0) {
      return NextResponse.json({ error: 'Picking List tidak ditemukan' }, { status: 404 });
    }

    const firstRow = matchingRows[0];
    const roNumber = roIdx !== -1 ? String(firstRow[roIdx] || '') : '';
    const customer = custIdx !== -1 ? String(firstRow[custIdx] || '') : '';
    const branch = branchIdx !== -1 ? String(firstRow[branchIdx] || '') : '';
    const roDate = roDateIdx !== -1 ? String(firstRow[roDateIdx] || '') : '';

    // Sort by sequence
    matchingRows.sort((a, b) => {
      const seqA = seqIdx !== -1 ? parseInt(String(a[seqIdx] || '0'), 10) : 0;
      const seqB = seqIdx !== -1 ? parseInt(String(b[seqIdx] || '0'), 10) : 0;
      return seqA - seqB;
    });

    const wb = XLSX.utils.book_new();
    const wsData: (string | number)[][] = [];

    // --- HEADER BLOCK ---
    wsData.push(['PICKING LIST', '', '', '', '', '']);
    wsData.push(['']);
    wsData.push(['RO Number:', roNumber, '', 'Customer:', customer, '']);
    wsData.push(['Branch:', branch, '', 'RO Date:', roDate, '']);
    wsData.push(['Printed:', new Date().toLocaleString('id-ID'), '', 'Printed By:', 'Inventory Control', '']);
    wsData.push(['']);
    wsData.push(['']);

    // --- TABLE HEADER ---
    wsData.push(['Seq', 'Rack', 'Zona', 'SKU Name', 'Qty Pick', 'Expired Date']);

    // --- TABLE ROWS ---
    matchingRows.forEach((row, i) => {
      wsData.push([
        String(seqIdx !== -1 ? row[seqIdx] : (i + 1)),
        String(rackIdx !== -1 ? row[rackIdx] : ''),
        String(zoneIdx !== -1 ? row[zoneIdx] : ''),
        String(skuIdx !== -1 ? row[skuIdx] : ''),
        Number(qtyIdx !== -1 ? row[qtyIdx] : 0),
        String(expIdx !== -1 ? row[expIdx] : ''),
      ]);
    });

    // --- TOTAL ROW ---
    const totalQty = matchingRows.reduce((sum, row) => sum + Number(qtyIdx !== -1 ? row[qtyIdx] : 0), 0);
    wsData.push(['']);
    wsData.push(['TOTAL', '', '', '', totalQty, '']);

    const ws = XLSX.utils.aoa_to_sheet(wsData);

    ws['!cols'] = [
      { wch: 6 },   // Seq
      { wch: 12 },  // Rack
      { wch: 12 },  // Zona
      { wch: 40 },  // SKU Name
      { wch: 12 },  // Qty Pick
      { wch: 15 },  // Expired Date
    ];

    XLSX.utils.book_append_sheet(wb, ws, 'Picking List');

    const buf = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });

    return new NextResponse(buf, {
      headers: {
        'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'Content-Disposition': `attachment; filename="PickingList_${pickingListNo}.xlsx"`,
        'Content-Length': String(buf.length),
      },
    });
  } catch (error) {
    console.error('Export error:', error);
    return NextResponse.json(
      { error: 'Gagal ekspor Excel', detail: error instanceof Error ? error.message : String(error) },
      { status: 500 }
    );
  }
}