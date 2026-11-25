require('dotenv').config({ path: '.env.local' });
const { google } = require('googleapis');
const auth = new google.auth.GoogleAuth({
  credentials: {
    client_email: process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL,
    private_key: process.env.GOOGLE_PRIVATE_KEY?.replace(/\\n/g, '\n'),
  },
  scopes: ['https://www.googleapis.com/auth/spreadsheets'],
});
const sheets = google.sheets({ version: 'v4', auth });
const spreadsheetId = process.env.GOOGLE_SHEET_ID;

async function run() {
  console.log('=== NORMALIZING & RE-ARCHITECTING GOOGLE SHEETS ===');
  
  const masterRes = await sheets.spreadsheets.values.get({ spreadsheetId, range: 'Master Data!A1:Z200' });
  const masterRows = masterRes.data.values || [];
  const headerIdx = masterRows.findIndex(r => r[0] === 'Nomor Rak');
  const rawMasterData = masterRows.slice(headerIdx >= 0 ? headerIdx + 1 : 3);

  console.log('Extracted ' + rawMasterData.length + ' raw master rows');

  const skuMap = new Map();
  const racksList = [];

  for (const row of rawMasterData) {
    const rack = String(row[0] || '').trim();
    const locationType = String(row[1] || '').trim();
    const entity = String(row[2] || '').trim();
    const sku = String(row[3] || '').trim();
    const unit = String(row[4] || '').trim();

    if (!rack) continue;

    racksList.push({
      rack,
      locationType: locationType || 'RACKING',
      entity: entity || 'Default',
      status: 'Active'
    });

    if (sku) {
      if (!skuMap.has(sku.toLowerCase())) {
        skuMap.set(sku.toLowerCase(), {
          skuName: sku,
          unit: unit || 'Pcs',
          category: 'General'
        });
      }
    }
  }

  const catalogRows = [
    ['SKU_ID', 'Nama Barang', 'Satuan', 'Kategori', 'Status'],
    ...Array.from(skuMap.values()).map((s, i) => [`SKU-${String(i + 1).padStart(3, '0')}`, s.skuName, s.unit, s.category, 'Active'])
  ];

  const warehouseRows = [
    ['Rack_ID', 'Jenis Lokasi', 'Entitas', 'Status'],
    ...racksList.map(r => [r.rack, r.locationType, r.entity, r.status])
  ];

  const inboundRes = await sheets.spreadsheets.values.get({ spreadsheetId, range: 'Inbound!A1:Z200' });
  const inboundRows = inboundRes.data.values || [];
  const inboundHeaderIdx = inboundRows.findIndex(r => r[0] === 'Barcode');
  const rawInbound = inboundRows.slice(inboundHeaderIdx >= 0 ? inboundHeaderIdx + 1 : 1);

  const ledgerRows = [
    ['Record_ID', 'Timestamp', 'SKU_Name', 'Rack_ID', 'Qty_In', 'Expired_Date', 'SJ_Number', 'Remarks']
  ];

  let recId = 1;
  for (const row of rawInbound) {
    const sku = String(row[1] || '').trim();
    const timestamp = String(row[3] || '').trim() || new Date().toISOString();
    const expiry = String(row[4] || '').trim();
    const sj = String(row[5] || '').trim();

    if (!sku) continue;

    for (let i = 0; i < 6; i++) {
      const rackCol = 6 + i * 2;
      const qtyCol = 7 + i * 2;
      const rack = String(row[rackCol] || '').trim();
      const qty = parseInt(row[qtyCol] || '0', 10) || 0;

      if (rack && qty > 0) {
        ledgerRows.push([
          `REC-${String(recId++).padStart(4, '0')}`,
          timestamp,
          sku,
          rack,
          String(qty),
          expiry,
          sj,
          'Initial Migration Inbound'
        ]);
      }
    }
  }

  const meta = await sheets.spreadsheets.get({ spreadsheetId });
  const existingTitles = meta.data.sheets.map(s => s.properties.title);

  async function ensureSheet(title) {
    if (!existingTitles.includes(title)) {
      await sheets.spreadsheets.batchUpdate({
        spreadsheetId,
        requestBody: { requests: [{ addSheet: { properties: { title } } }] }
      });
      console.log('Created sheet: ' + title);
    }
  }

  await ensureSheet('Catalog');
  await ensureSheet('Physical_Warehouse');
  await ensureSheet('Ledger');

  async function writeToSheet(range, values) {
    await sheets.spreadsheets.values.clear({ spreadsheetId, range });
    await sheets.spreadsheets.values.update({
      spreadsheetId,
      range,
      valueInputOption: 'USER_ENTERED',
      requestBody: { values }
    });
  }

  await writeToSheet('Catalog!A1', catalogRows);
  console.log('✓ Catalog populated with ' + (catalogRows.length - 1) + ' SKUs');

  await writeToSheet('Physical_Warehouse!A1', warehouseRows);
  console.log('✓ Physical_Warehouse populated with ' + (warehouseRows.length - 1) + ' racks');

  await writeToSheet('Ledger!A1', ledgerRows);
  console.log('✓ Ledger populated with ' + (ledgerRows.length - 1) + ' transactions');

  console.log('\n=== RE-ARCHITECTING COMPLETE ===');
}

run().catch(console.error);
