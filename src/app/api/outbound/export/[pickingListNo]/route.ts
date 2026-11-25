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

    // Find rows matching this pickingListNo
    // Headers: No, PL_No, RO_Number, Customer, Branch, RO_Date, Rack_ID, SKU_Name, Qty_Pick, Expired_Date, Zone, Sequence, Status, Timestamp
    const header = allRows[0];
    const plNoIdx = header.findIndex(h => String(h).toLowerCase().includes('picking_list_no'));
    const roIdx = header.findIndex(h => String(h).toLowerCase().includes('ro_number'));
    const custIdx = header.findIndex(h => String(h).toLowerCase().includes('customer'));
    const branchIdx = header.findIndex(h => String(h).toLowerCase().includes('branch'));
    const roDateIdx = header.findIndex(h => String(h).toLowerCase().includes('ro_date'));
    const rackIdx = header.findIndex(h => String(h).toLowerCase().includes('rack_id'));
    const skuIdx = header.findIndex(h => String(h).toLowerCase().includes('sku_name'));
    const qtyIdx = header.findIndex(h => String(h).toLowerCase().includes('qty_pick'));
    const expIdx = header.findIndex(h => String(h).toLowerCase().includes('expired_date'));
    const zoneIdx = header.findIndex(h => String(h).toLowerCase().includes('zone'));
    const seqIdx = header.findIndex(h => String(h).toLowerCase().includes('sequence'));

    const matchingRows = allRows.slice(1).filter(row => String(row[plNoIdx] || '') === pickingListNo);
    
    if (matchingRows.length === 0) {
      return NextResponse.json({ error: 'Picking List tidak ditemukan' }, { status: 404 });
    }

    // Extract RO details from first row
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

    // Build workbook
    const wb = XLSX.utils.book_new();
    const wsData: (string | number)[][] = [];

    // --- HEADER BLOCK ---
    wsData.push(['PICKING LIST', '', '', '', '', '', '', '', '']);
    wsData.push(['']);
    wsData.push(['RO Number:', roNumber, '', '', 'Customer:', customer, '', '', '']);
    wsData.push(['Branch:', branch, '', '', 'RO Date:', roDate, '', '', '']);
    wsData.push(['Printed:', new Date().toLocaleString('id-ID'), '', '', 'Printed By:', 'Inventory Control System', '', '', '']);
    wsData.push(['']);
    wsData.push(['']);

    // --- TABLE HEADER ---
    wsData.push(['Seq', 'Rack', 'Zone', 'SKU Name', 'Qty Pick', 'Expired Date']);

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

    // Set column widths
    const colWidths = [
      { wch: 6 },   // Seq
      { wch: 12 },  // Rack
      { wch: 12 },  // Zone
      { wch: 40 },  // SKU Name
      { wch: 12 },  // Qty Pick
      { wch: 15 },  // Expired Date
    ];
    ws['!cols'] = colWidths;

    XLSX.utils.book_append_sheet(wb, ws, 'Picking List');

    // Generate buffer
    const buf = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });

    // Return as file download
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