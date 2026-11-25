import { NextResponse } from 'next/server';
import { getSheetsClient, readSheet, appendRow, SHEETS } from '@/lib/google-sheets';

export const dynamic = 'force-dynamic';

/**
 * Confirm Outbound:
 * 1. Write negative qty entries to Ledger (outbound)
 * 2. Create Picking List sheet entry with RO details
 */
export async function POST(request: Request) {
  try {
    const body = await request.json();
    const allocations = body.allocations || [];
    const roNumber = body.roNumber?.trim() || '';
    const customer = body.customer?.trim() || '';
    const branch = body.branch?.trim() || '';
    const roDate = body.roDate?.trim() || new Date().toISOString().slice(0, 10);

    if (!allocations.length) {
      return NextResponse.json({ error: 'Tidak ada alokasi untuk dikonfirmasi' }, { status: 400 });
    }
    if (!roNumber) {
      return NextResponse.json({ error: 'RO Number wajib diisi' }, { status: 400 });
    }

    const client = await getSheetsClient();
    const spreadsheetId = process.env.GOOGLE_SHEET_ID!;

    // Generate picking list number (YYMMDD format)
    const now = new Date();
    const dateStr = now.getFullYear().toString().slice(-2) + 
                    String(now.getMonth() + 1).padStart(2, '0') + 
                    String(now.getDate()).padStart(2, '0');
    const timestamp = Date.now().toString().slice(-6);
    const pickingListNo = `PL-${dateStr}-${timestamp}`;

    // 1. Write outbound entries to Ledger (negative qty)
    let ledgerEntries = 0;
    for (const alloc of allocations) {
      const recordId = `REC-OUT-${Date.now()}-${ledgerEntries}`;
      await appendRow(SHEETS.LEDGER, [
        recordId,
        new Date().toISOString(),
        alloc.skuName,
        alloc.rackId,
        -alloc.qtyAllocated, // NEGATIVE for outbound
        alloc.expiredDate,
        pickingListNo,
        `Outbound via ${pickingListNo} (RO: ${roNumber})`,
      ]);
      ledgerEntries++;
    }

    // 2. Write to Picking List sheet (enhanced with RO details columns)
    const plHeaders = [
      'No', 'Picking_List_No', 'RO_Number', 'Customer', 'Branch', 'RO_Date',
      'Rack_ID', 'SKU_Name', 'Qty_Pick', 'Expired_Date', 'Zone', 'Sequence', 'Status', 'Timestamp'
    ];

    // Check if Picking List sheet exists, create if not
    const meta = await client.spreadsheets.get({ spreadsheetId });
    const sheetTitles = (meta.data.sheets || []).map(s => s.properties?.title);
    
    if (!sheetTitles.includes('Picking_List')) {
      await client.spreadsheets.batchUpdate({
        spreadsheetId,
        requestBody: { requests: [{ addSheet: { properties: { title: 'Picking_List' } } }] }
      });
    }

    // Read existing to find next row
    const existing = await readSheet('Picking_List');
    const hasHeader = existing.length > 0 && String(existing[0]?.[0] || '').toLowerCase().includes('no');
    const startRow = existing.length + 1;
    const nextNo = hasHeader ? existing.length - 1 : existing.length;

    // If empty sheet, write header first
    if (!hasHeader) {
      await client.spreadsheets.values.update({
        spreadsheetId,
        range: 'Picking_List!A1',
        valueInputOption: 'USER_ENTERED',
        requestBody: { values: [plHeaders] },
      });
    }

    const plRows = allocations.map((alloc: any, i: number) => [
      String(nextNo + i + 1),
      pickingListNo,
      roNumber,
      customer,
      branch,
      roDate,
      alloc.rackId,
      alloc.skuName,
      String(alloc.qtyAllocated),
      alloc.expiredDate,
      alloc.zone,
      String(alloc.sequence),
      'PENDING',
      new Date().toISOString(),
    ]);

    const writeStart = hasHeader ? startRow : 2;
    await client.spreadsheets.values.update({
      spreadsheetId,
      range: `Picking_List!A${writeStart}`,
      valueInputOption: 'USER_ENTERED',
      requestBody: { values: plRows },
    });

    return NextResponse.json({
      success: true,
      pickingListNo,
      ledgerEntries,
      roNumber,
      customer,
      branch,
      roDate,
      message: `Picking List ${pickingListNo} dibuat untuk RO ${roNumber} dengan ${ledgerEntries} entri.`
    });
  } catch (error) {
    console.error('Confirm outbound error:', error);
    return NextResponse.json(
      { error: 'Gagal konfirmasi outbound', detail: error instanceof Error ? error.message : String(error) },
      { status: 500 }
    );
  }
}