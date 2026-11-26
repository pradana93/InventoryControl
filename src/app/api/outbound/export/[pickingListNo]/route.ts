import { NextResponse } from 'next/server';
import { getPickingListRows } from '@/lib/google-sheets';
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

    const rows = await getPickingListRows(pickingListNo);

    if (rows.length === 0) {
      return NextResponse.json({ error: 'Picking List tidak ditemukan' }, { status: 404 });
    }

    // Sort by sequence (picking path)
    rows.sort((a, b) => a.sequence - b.sequence);

    const first = rows[0];
    const roNumber = first.roNumber || '';
    const customer = first.customer || '';
    const branch = first.branch || '';
    const roDate = first.roDate || '';

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
    rows.forEach((row, i) => {
      wsData.push([
        row.sequence || i + 1,
        row.rackId || '',
        row.zone || '',
        row.skuName || '',
        Number(row.qtyPick || 0),
        row.expiredDate || '',
      ]);
    });

    // --- TOTAL ROW ---
    const totalQty = rows.reduce((sum, row) => sum + Number(row.qtyPick || 0), 0);
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
