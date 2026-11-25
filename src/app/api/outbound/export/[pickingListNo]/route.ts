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
    
    // Exact header mapping based on confirm/route.ts:
    // ['No', 'Picking_List_No', 'RO_Number', 'Customer', 'Branch', 'RO_Date', 'Rack_ID', 'SKU_Name', 'Qty_Pick', 'Expired_Date', 'Zone', 'Sequence', 'Status', 'Timestamp']
    const plNoIdx = header.indexOf('Picking_List_No');
    const roIdx = header.indexOf('RO_Number');
    const custIdx = header.indexOf('Customer');
    const branchIdx = header.indexOf('Branch');
    const roDateIdx = header.indexOf('RO_Date');
    const rackIdx = header.indexOf('Rack_ID');
    const skuIdx = header.indexOf('SKU_Name');
    const qtyIdx = header.indexOf('Qty_Pick');
    const expIdx = header.indexOf('Expired_Date');
    const zoneIdx = header.indexOf('Zone');
    const seqIdx = header.indexOf('Sequence');

    const matchingRows = allRows.slice(1).filter(row => String(row[plNoIdx] || '').trim() === pickingListNo.trim());
    
    if (matchingRows.length === 0) {
      return NextResponse.json({ error: 'Picking List tidak ditemukan' }, { status: 404 });
    }

    const firstRow = matchingRows[0];
    const roNumber = String(firstRow[roIdx] || '');
    const customer = String(firstRow[custIdx] || '');
    const branch = String(firstRow[branchIdx] || '');
    const roDate = String(firstRow[roDateIdx] || '');

    // Sort by sequence
    matchingRows.sort((a, b) => {
      const seqA = parseInt(String(a[seqIdx] || '0'), 10);
      const seqB = parseInt(String(b[seqIdx] || '0'), 10);
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
        String(row[seqIdx] || (i + 1)),
        String(row[rackIdx] || ''),
        String(row[zoneIdx] || ''),
        String(row[skuIdx] || ''),
        Number(row[qtyIdx] || 0),
        String(row[expIdx] || ''),
      ]);
    });

    // --- TOTAL ROW ---
    const totalQty = matchingRows.reduce((sum, row) => sum + Number(row[qtyIdx] || 0), 0);
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