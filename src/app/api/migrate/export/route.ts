import { NextResponse } from 'next/server';
import { google, sheets_v4 } from 'googleapis';
import { JWT } from 'google-auth-library';
import { supabaseAdmin } from '@/lib/supabase';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

const SHEETS = {
  CATALOG: 'Catalog',
  WAREHOUSE: 'Physical_Warehouse',
  LEDGER: 'Ledger',
  STOCK_OPNAME: 'Stock_Opname',
  RACK_LABELS: 'Rack_Labels',
} as const;

async function getSheetsClient(): Promise<sheets_v4.Sheets> {
  const auth = new JWT({
    email: process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL,
    key: process.env.GOOGLE_PRIVATE_KEY?.replace(/\\n/g, '\n'),
    scopes: ['https://www.googleapis.com/auth/spreadsheets'],
  });
  return google.sheets({ version: 'v4', auth });
}

async function readSheet(sheetName: string, range?: string): Promise<string[][]> {
  const client = await getSheetsClient();
  const spreadsheetId = process.env.GOOGLE_SHEET_ID!;
  const res = await client.spreadsheets.values.get({
    spreadsheetId,
    range: range || sheetName,
  });
  return res.data.values || [];
}

function _str(v: unknown): string { return v === null || v === undefined ? '' : String(v); }
function _num(v: unknown): number { const n = Number(v); return isNaN(n) ? 0 : n; }
function _entity(v: unknown): 'BBB' | 'BBT' { const s = String(v || '').trim().toUpperCase(); return s === 'BBT' ? 'BBT' : 'BBB'; }
function toDateOnly(v: unknown): string {
  if (!v) return '';
  const s = String(v);
  if (/^\d{4}-\d{2}-\d{2}/.test(s)) return s.slice(0, 10);
  const d = new Date(s);
  if (isNaN(d.getTime())) return '';
  return d.toISOString().slice(0, 10);
}

export async function GET() {
  const log: string[] = [];
  try {
    // 1. CATALOG
    const catalogRows = await readSheet(SHEETS.CATALOG);
    log.push(`Catalog raw rows: ${catalogRows.length}`);
    const catalog = catalogRows.slice(1)
      .filter((r) => r[0] && r[1])
      .map((r, i) => ({
        sku_id: _str(r[0] || `SKU-${String(i + 1).padStart(3, '0')}`).trim(),
        nama_barang: _str(r[1] || '').trim(),
        satuan: _str(r[2] || 'Pcs').trim(),
        kategori: _str(r[3] || 'General').trim(),
        status: _str(r[4] || 'Active').trim(),
        entitas: _entity(r[5]),
        barcode: _str(r[6] || '').trim(),
      }));
    if (catalog.length > 0) {
      const { error } = await supabaseAdmin.from('catalog').upsert(catalog, { onConflict: 'sku_id' });
      log.push(error ? `Catalog error: ${error.message}` : `✓ Catalog: ${catalog.length}`);
    }

    // 2. WAREHOUSE
    const warehouseRows = await readSheet(SHEETS.WAREHOUSE);
    log.push(`Warehouse raw rows: ${warehouseRows.length}`);
    const warehouse = warehouseRows.slice(1)
      .filter((r) => r[0])
      .map((r) => ({
        rack_id: _str(r[0]).trim(),
        jenis_lokasi: _str(r[1] || 'RACKING').trim(),
        entitas: _entity(r[2]),
        status: _str(r[3] || 'Active').trim(),
      }));
    if (warehouse.length > 0) {
      const { error } = await supabaseAdmin.from('physical_warehouse').upsert(warehouse, { onConflict: 'rack_id' });
      log.push(error ? `Warehouse error: ${error.message}` : `✓ Warehouse: ${warehouse.length}`);
    }

    // 3. LEDGER
    const ledgerRows = await readSheet(SHEETS.LEDGER);
    log.push(`Ledger raw rows: ${ledgerRows.length}`);
    const ledger = ledgerRows.slice(1)
      .filter((r) => r[0] && r[2] && r[3])
      .map((r) => ({
        record_id: _str(r[0]).trim(),
        timestamp: _str(r[1]).trim() || new Date().toISOString(),
        sku_name: _str(r[2]).trim(),
        rack_id: _str(r[3]).trim(),
        qty_in: _num(r[4]),
        expired_date: toDateOnly(r[5]) || null,
        sj_number: _str(r[6] || '').trim(),
        remarks: _str(r[7] || '').trim(),
        entitas: _entity(r[8]),
      }));
    if (ledger.length > 0) {
      let ok = 0;
      for (let i = 0; i < ledger.length; i += 500) {
        const chunk = ledger.slice(i, i + 500);
        const { error } = await supabaseAdmin.from('ledger').upsert(chunk, { onConflict: 'record_id' });
        if (error) log.push(`Ledger chunk ${i} error: ${error.message}`);
        else ok += chunk.length;
      }
      log.push(`✓ Ledger: ${ok}`);
    }

    // 4. STOCK OPNAME
    const opnameRows = await readSheet(SHEETS.STOCK_OPNAME);
    log.push(`Opname raw rows: ${opnameRows.length}`);
    const opname = opnameRows.slice(1)
      .filter((r) => r[0] && r[1])
      .map((r) => ({
        rack_id: _str(r[0]).trim(),
        sku_name: _str(r[1]).trim(),
        qty_sistem: _num(r[2]),
        qty_fisik_soh: _num(r[3]),
        tanggal_opname: toDateOnly(r[6]) || new Date().toISOString().slice(0, 10),
        petugas: _str(r[7] || '').trim(),
        catatan: _str(r[8] || '').trim(),
        entitas: 'BBB' as const,
      }));
    if (opname.length > 0) {
      const { error } = await supabaseAdmin.from('stock_opname').upsert(opname, { onConflict: 'rack_id,sku_name,entitas' });
      log.push(error ? `Opname error: ${error.message}` : `✓ Opname: ${opname.length}`);
    }

    // 5. RACK LABELS
    const labelRows = await readSheet(SHEETS.RACK_LABELS, `${SHEETS.RACK_LABELS}!A2:N400`);
    log.push(`Labels raw rows: ${labelRows.length}`);
    const labels: any[] = [];
    for (const row of labelRows) {
      if (row[0] && _str(row[0]).trim()) {
        labels.push({
          rack_id: _str(row[0]).trim(),
          sku_name: _str(row[1] || '-').trim(),
          jenis_lokasi: _str(row[2] || 'RACKING').trim(),
          barcode: _str(row[3] || '').trim(),
          qr_url: _str(row[4] || '').trim(),
          entitas: 'BBB' as const,
        });
      }
      if (row[8] && _str(row[8]).trim()) {
        labels.push({
          rack_id: _str(row[8]).trim(),
          sku_name: _str(row[9] || '-').trim(),
          jenis_lokasi: _str(row[10] || 'RACKING').trim(),
          barcode: _str(row[11] || '').trim(),
          qr_url: _str(row[12] || '').trim(),
          entitas: 'BBB' as const,
        });
      }
    }
    if (labels.length > 0) {
      const { error } = await supabaseAdmin.from('rack_labels').upsert(labels, { onConflict: 'rack_id,entitas' });
      log.push(error ? `Labels error: ${error.message}` : `✓ Rack Labels: ${labels.length}`);
    }

    return NextResponse.json({ success: true, log });
  } catch (error) {
    return NextResponse.json(
      { success: false, log, error: error instanceof Error ? error.message : String(error) },
      { status: 500 }
    );
  }
}
