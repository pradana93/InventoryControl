/**
 * Update Catalog sheet with new SKU data from Excel
 * Run with: npx tsx scripts/update-catalog-from-excel.ts
 */

import { google } from 'googleapis';
import * as XLSX from 'xlsx';
import * as dotenv from 'dotenv';

dotenv.config({ path: '.env.local' });

// ============================================
// PARSE EXCEL DATA
// ============================================

const wb = XLSX.readFile('C:/Users/USER/OneDrive/Desktop/SKU Vittoria BBB & BBT.xlsx');
const ws = wb.Sheets['Sheet1'];
const data = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '' });

// Extract BBB (col 0) and BBT (col 2) SKUs, starting from row 3 (index 3)
const bbbSkus: string[] = [];
const bbtSkus: string[] = [];

for (let i = 3; i < data.length; i++) {
  const row = data[i] as string[];
  if (row[0] && row[0].toString().trim()) {
    bbbSkus.push(row[0].toString().trim());
  }
  if (row[2] && row[2].toString().trim()) {
    bbtSkus.push(row[2].toString().trim());
  }
}

console.log(`BBB SKUs: ${bbbSkus.length}`);
console.log(`BBT SKUs: ${bbtSkus.length}`);

// Find overlaps
const bbbSet = new Set(bbbSkus.map(s => s.toLowerCase()));
const bbtSet = new Set(bbtSkus.map(s => s.toLowerCase()));

const overlaps = bbbSkus.filter(sku => bbtSet.has(sku.toLowerCase()));
console.log(`Overlaps (in both): ${overlaps.length}`);
overlaps.forEach(s => console.log(`  - ${s}`));

// ============================================
// BUILD CATALOG ENTRIES
// ============================================

interface CatalogRow {
  skuId: string;
  namaBarang: string;
  satuan: string;
  kategori: string;
  status: string;
  entitas: string;
  barcode: string;
}

const catalogRows: CatalogRow[] = [];

// Helper to determine satuan based on SKU name patterns
function getSatuan(namaBarang: string): string {
  const name = namaBarang.toLowerCase();
  if (name.includes('dus') || name.includes('box') || name.includes('pack') || name.includes('ktn') || name.includes('rim') || name.includes('ctn')) {
    return 'Pack';
  }
  if (name.includes('jar') || name.includes('jerigen') || name.includes('botol') || name.includes('liter') || name.includes('saset') || name.includes('sachet') || name.includes('ikat')) {
    return 'Ikat';
  }
  if (name.includes('bks') || name.includes('bungkus')) {
    return 'Bks';
  }
  if (name.includes('jrg')) {
    return 'Jrg';
  }
  if (name.includes('set')) {
    return 'Set';
  }
  if (name.includes('inner')) {
    return 'Pcs';
  }
  // Default
  return 'Pcs';
}

// Helper to determine kategori
function getKategori(namaBarang: string): string {
  const name = namaBarang.toLowerCase();
  if (name.includes('seragam') || name.includes('kaus') || name.includes('kemeja') || name.includes('polo') || name.includes('topi') || name.includes('apron') || name.includes('name tag')) {
    return 'Seragam';
  }
  if (name.includes('sabun') || name.includes('pembersih') || name.includes('sanitizer') || name.includes('minyak') || name.includes('sedotan') || name.includes('tissue') || name.includes('hand gloves') || name.includes('hand sanitizer')) {
    return 'Kebersihan & Perlengkapan';
  }
  if (name.includes('dus') || name.includes('box') || name.includes('packaging') || name.includes('inner') || name.includes('cup') || name.includes('gelas') || name.includes('tray') || name.includes('paper bag') || name.includes('kertas') || name.includes('plastik') || name.includes('kresek') || name.includes('tutup') || name.includes('spunbond') || name.includes('sticker') || name.includes('label')) {
    return 'Packaging';
  }
  if (name.includes('kentang') || name.includes('nugget') || name.includes('patty') || name.includes('ayam') || name.includes('beef') || name.includes('sosis') || name.includes('burger') || name.includes('bun') || name.includes('sauce') || name.includes('mayonaise') || name.includes('keju') || name.includes('butter') || name.includes('sambal') || name.includes('saos') || name.includes('nestea') || name.includes('lemontea') || name.includes('smoke beef') || name.includes('bolognese') || name.includes('bbq') || name.includes('cheese') || name.includes('chicken') || name.includes('dori') || name.includes('popcorn') || name.includes('crispy') || name.includes('spicy') || name.includes('nacho') || name.includes('rendang') || name.includes('thousand island') || name.includes('cup sauce') || name.includes('kertas nasi')) {
    return 'Food & Beverage';
  }
  if (name.includes('brosur') || name.includes('poster') || name.includes('spanduk') || name.includes('kupon') || name.includes('papan') || name.includes('tripod') || name.includes('umroh')) {
    return 'Marketing';
  }
  return 'General';
}

// Add BBB SKUs
bbbSkus.forEach((sku, idx) => {
  catalogRows.push({
    skuId: `BBB-${String(idx + 1).padStart(3, '0')}`,
    namaBarang: sku,
    satuan: getSatuan(sku),
    kategori: getKategori(sku),
    status: 'Active',
    entitas: 'BBB',
    barcode: '',
  });
});

// Add BBT SKUs
bbtSkus.forEach((sku, idx) => {
  catalogRows.push({
    skuId: `BBT-${String(idx + 1).padStart(3, '0')}`,
    namaBarang: sku,
    satuan: getSatuan(sku),
    kategori: getKategori(sku),
    status: 'Active',
    entitas: 'BBT',
    barcode: '',
  });
});

console.log(`\nTotal catalog entries to write: ${catalogRows.length}`);

// ============================================
// WRITE TO GOOGLE SHEETS
// ============================================

async function main() {
  const auth = new google.auth.GoogleAuth({
    credentials: {
      client_email: process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL,
      private_key: (process.env.GOOGLE_PRIVATE_KEY || '').replace(/\\n/g, '\n'),
    },
    scopes: ['https://www.googleapis.com/auth/spreadsheets'],
  });

  const sheets = google.sheets({ version: 'v4', auth: await auth.getClient() as any });
  const spreadsheetId = process.env.GOOGLE_SHEET_ID!;

  // 1. Read current sheet to get sheetId for Catalog
  const meta = await sheets.spreadsheets.get({ spreadsheetId });
  const catalogSheet = meta.data.sheets?.find(s => s.properties?.title === 'Catalog');
  if (!catalogSheet) {
    throw new Error('Catalog sheet not found');
  }
  const sheetId = catalogSheet.properties!.sheetId!;

  // 2. Clear all data rows (keep header)
  // Get current row count
  const currentData = await sheets.spreadsheets.values.get({
    spreadsheetId,
    range: 'Catalog!A:Z',
  });
  const currentRows = currentData.data.values?.length || 1;
  
  if (currentRows > 1) {
    // Delete rows 2 to end (keep header row 1)
    await sheets.spreadsheets.batchUpdate({
      spreadsheetId,
      requestBody: {
        requests: [{
          deleteDimension: {
            range: {
              sheetId,
              dimension: 'ROWS',
              startIndex: 1, // 0-indexed, row 2
              endIndex: currentRows, // 0-indexed exclusive
            },
          },
        }],
      },
    });
    console.log(`Cleared ${currentRows - 1} existing data rows`);
  }

  // 3. Update header to include Entitas column (after Status, before Barcode)
  // New header: SKU_ID, Nama Barang, Satuan, Kategori, Status, Entitas, Barcode
  const newHeader = [
    'SKU_ID',
    'Nama Barang',
    'Satuan',
    'Kategori',
    'Status',
    'Entitas',
    'Barcode'
  ];

  await sheets.spreadsheets.values.update({
    spreadsheetId,
    range: 'Catalog!A1:G1',
    valueInputOption: 'USER_ENTERED',
    requestBody: { values: [newHeader] },
  });
  console.log('Updated header with Entitas column');

  // 4. Write all catalog rows in batches (max 1000 rows per request)
  const batchSize = 500;
  for (let i = 0; i < catalogRows.length; i += batchSize) {
    const batch = catalogRows.slice(i, i + batchSize);
    const values = batch.map(r => [
      r.skuId,
      r.namaBarang,
      r.satuan,
      r.kategori,
      r.status,
      r.entitas,
      r.barcode,
    ]);
    
    const startRow = i + 2; // 1-indexed, after header
    const endRow = startRow + batch.length - 1;
    const range = `Catalog!A${startRow}:G${endRow}`;
    
    await sheets.spreadsheets.values.update({
      spreadsheetId,
      range,
      valueInputOption: 'USER_ENTERED',
      requestBody: { values },
    });
    console.log(`Wrote batch ${Math.floor(i / batchSize) + 1}: rows ${startRow}-${endRow} (${batch.length} entries)`);
  }

  console.log('\n✅ Catalog update complete!');
  console.log(`BBB entries: ${bbbSkus.length}`);
  console.log(`BBT entries: ${bbtSkus.length}`);
  console.log(`Total: ${catalogRows.length}`);
}

main().catch(console.error);