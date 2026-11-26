import dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

// We need to use the ORIGINAL Google Sheets logic - let's reimplement it here
import { google, sheets_v4 } from 'googleapis';
import { JWT } from 'google-auth-library';
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const supabase = createClient(supabaseUrl, supabaseServiceKey, {
  auth: { autoRefreshToken: false, persistSession: false },
});

// ============================================================================
// GOOGLE SHEETS READERS (Original implementation)
// ============================================================================

const SHEETS = {
  CATALOG: 'Catalog',
  WAREHOUSE: 'Physical_Warehouse',
  LEDGER: 'Ledger',
  STOCK_OPNAME: 'Stock_Opname',
  RACK_LABELS: 'Rack_Labels',
} as const;

let sheetsClient: sheets_v4.Sheets | null = null;

async function getSheetsClient(): Promise<sheets_v4.Sheets> {
  if (sheetsClient) return sheetsClient;
  const auth = new JWT({
    email: process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL,
    key: process.env.GOOGLE_PRIVATE_KEY?.replace(/\\n/g, '\n'),
    scopes: ['https://www.googleapis.com/auth/spreadsheets'],
  });
  sheetsClient = google.sheets({ version: 'v4', auth });
  return sheetsClient;
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

function _str(v: any): string { return v === null || v === undefined ? '' : String(v); }
function _num(v: any): number { const n = Number(v); return isNaN(n) ? 0 : n; }
function _entity(v: any): 'BBB' | 'BBT' { const s = String(v || '').trim().toUpperCase(); return s === 'BBT' ? 'BBT' : 'BBB'; }
function toDateOnly(v: any): string { if (!v) return ''; const s = String(v); if (/^\d{4}-\d{2}-\d{2}/.test(s)) return s.slice(0, 10); const d = new Date(s); if (isNaN(d.getTime())) return ''; return d.toISOString().slice(0, 10); }

// ============================================================================
// MIGRATION
// ============================================================================

async function migrate() {
  console.log('Fetching data from Google Sheets...');
  
  // 1. CATALOG
  console.log('Reading Catalog...');
  const catalogRows = await readSheet(SHEETS.CATALOG);
  console.log(`  Raw rows: ${catalogRows.length}`);
  const catalog = catalogRows.slice(1)
    .filter(r => r[0] && r[1])
    .map((r, i) => ({
      sku_id: _str(r[0] || `SKU-${String(i + 1).padStart(3, '0')}`).trim(),
      nama_barang: _str(r[1] || '').trim(),
      satuan: _str(r[2] || 'Pcs').trim(),
      kategori: _str(r[3] || 'General').trim(),
      status: _str(r[4] || 'Active').trim(),
      entitas: _entity(r[5]),
      barcode: _str(r[6] || '').trim(),
    }));
  console.log(`  Valid entries: ${catalog.length}`);
  
  if (catalog.length > 0) {
    const { error } = await supabase.from('catalog').upsert(catalog, { onConflict: 'sku_id' });
    if (error) console.error('  Catalog error:', error.message);
    else console.log('  ✓ Catalog migrated');
  }

  // 2. WAREHOUSE
  console.log('Reading Warehouse...');
  const warehouseRows = await readSheet(SHEETS.WAREHOUSE);
  console.log(`  Raw rows: ${warehouseRows.length}`);
  const warehouse = warehouseRows.slice(1)
    .filter(r => r[0])
    .map(r => ({
      rack_id: _str(r[0] || '').trim(),
      jenis_lokasi: _str(r[1] || 'RACKING').trim(),
      entitas: _entity(r[2]),
      status: _str(r[3] || 'Active').trim(),
    }));
  console.log(`  Valid entries: ${warehouse.length}`);
  
  if (warehouse.length > 0) {
    const { error } = await supabase.from('physical_warehouse').upsert(warehouse, { onConflict: 'rack_id' });
    if (error) console.error('  Warehouse error:', error.message);
    else console.log('  ✓ Warehouse migrated');
  }

  // 3. LEDGER
  console.log('Reading Ledger...');
  const ledgerRows = await readSheet(SHEETS.LEDGER);
  console.log(`  Raw rows: ${ledgerRows.length}`);
  const ledger = ledgerRows.slice(1)
    .filter(r => r[0] && r[2] && r[3])
    .map(r => ({
      record_id: _str(r[0] || '').trim(),
      timestamp: _str(r[1] || '').trim() || new Date().toISOString(),
      sku_name: _str(r[2] || '').trim(),
      rack_id: _str(r[3] || '').trim(),
      qty_in: _num(r[4]),
      expired_date: toDateOnly(r[5]) || null,
      sj_number: _str(r[6] || '').trim(),
      remarks: _str(r[7] || '').trim(),
      entitas: _entity(r[8]),
    }));
  console.log(`  Valid entries: ${ledger.length}`);
  
  if (ledger.length > 0) {
    for (let i = 0; i < ledger.length; i += 500) {
      const chunk = ledger.slice(i, i + 500);
      const { error } = await supabase.from('ledger').upsert(chunk, { onConflict: 'record_id' });
      if (error) console.error(`  Ledger chunk ${i} error:`, error.message);
    }
    console.log('  ✓ Ledger migrated');
  }

  // 4. STOCK OPNAME
  console.log('Reading Stock Opname...');
  const opnameRows = await readSheet(SHEETS.STOCK_OPNAME);
  console.log(`  Raw rows: ${opnameRows.length}`);
  const opname = opnameRows.slice(1)
    .filter(r => r[0] && r[1])
    .map(r => {
      const qtySistem = _num(r[2]);
      const qtyFisik = _num(r[3]);
      return {
        rack_id: _str(r[0] || '').trim(),
        sku_name: _str(r[1] || '').trim(),
        qty_sistem: qtySistem,
        qty_fisik_soh: qtyFisik,
        tanggal_opname: toDateOnly(r[6]) || new Date().toISOString().slice(0, 10),
        petugas: _str(r[7] || '').trim(),
        catatan: _str(r[8] || '').trim(),
        entitas: 'BBB', // default
      };
    });
  console.log(`  Valid entries: ${opname.length}`);
  
  if (opname.length > 0) {
    const { error } = await supabase.from('stock_opname').upsert(opname, { onConflict: 'rack_id,sku_name,entitas' });
    if (error) console.error('  Opname error:', error.message);
    else console.log('  ✓ Stock Opname migrated');
  }

  // 5. RACK LABELS
  console.log('Reading Rack Labels...');
  const labelRows = await readSheet(SHEETS.RACK_LABELS, `${SHEETS.RACK_LABELS}!A2:N400`);
  console.log(`  Raw rows: ${labelRows.length}`);
  const labels: any[] = [];
  for (const row of labelRows) {
    if (row[0] && _str(row[0]).trim()) {
      labels.push({
        rack_id: _str(row[0]).trim(),
        sku_name: _str(row[1] || '-').trim(),
        jenis_lokasi: _str(row[2] || 'RACKING').trim(),
        barcode: _str(row[3] || '').trim(),
        qr_url: _str(row[4] || '').trim(),
        entitas: 'BBB',
      });
    }
    if (row[8] && _str(row[8]).trim()) {
      labels.push({
        rack_id: _str(row[8]).trim(),
        sku_name: _str(row[9] || '-').trim(),
        jenis_lokasi: _str(row[10] || 'RACKING').trim(),
        barcode: _str(row[11] || '').trim(),
        qr_url: _str(row[12] || '').trim(),
        entitas: 'BBB',
      });
    }
  }
  console.log(`  Valid entries: ${labels.length}`);
  
  if (labels.length > 0) {
    const { error } = await supabase.from('rack_labels').upsert(labels, { onConflict: 'rack_id,entitas' });
    if (error) console.error('  Labels error:', error.message);
    else console.log('  ✓ Rack Labels migrated');
  }

  console.log('\n✅ Migration complete!');
}

migrate().catch(e => {
  console.error('Migration failed:', e);
  process.exit(1);
});