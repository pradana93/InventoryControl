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
  console.log('=== CREATING STOCK_OPNAME SHEET ===');

  // 1. Get current inventory from Ledger (Qty Sistem per Rack + SKU)
  const ledgerRes = await sheets.spreadsheets.values.get({ spreadsheetId, range: 'Ledger!A1:H200' });
  const ledgerRows = ledgerRes.data.values || [];
  
  // Aggregate Ledger by Rack + SKU
  const stockMap = new Map(); // key: "RACK|SKU" -> { qty, expiry, inboundDate }
  for (let i = 1; i < ledgerRows.length; i++) {
    const r = ledgerRows[i];
    if (!r[2] || !r[3]) continue;
    const sku = String(r[2]).trim();
    const rack = String(r[3]).trim();
    const qty = parseFloat(String(r[4] || '0')) || 0;
    const expiry = String(r[5] || '').trim();
    const inbound = String(r[1] || '').trim();
    const key = `${rack}|${sku}`;
    
    if (!stockMap.has(key)) {
      stockMap.set(key, { rack, sku, qty: 0, expiry, inbound });
    }
    const entry = stockMap.get(key);
    entry.qty += qty;
    // Keep earliest expiry for FEFO
    if (expiry && (!entry.expiry || expiry < entry.expiry)) entry.expiry = expiry;
  }

  // 2. Build Stock Opname rows
  const opnameRows = [
    ['Rack_ID', 'SKU_Name', 'Qty_Sistem', 'Qty_Fisik_SOH', 'Variance', 'Akurasi_%', 'Tanggal_Opname', 'Petugas', 'Catatan']
  ];

  let totalSistem = 0, totalFisik = 0, totalVariance = 0;
  for (const [, v] of stockMap) {
    if (v.qty > 0) {
      // Initialize SOH = Sistem for now (will be updated during actual opname)
      const soh = v.qty;
      const variance = soh - v.qty;
      const accuracy = v.qty > 0 ? ((soh / v.qty) * 100).toFixed(2) + '%' : '100.00%';
      
      opnameRows.push([
        v.rack,
        v.sku,
        v.qty,
        soh,
        variance,
        accuracy,
        '', // Tanggal Opname - empty until counted
        '', // Petugas
        ''  // Catatan
      ]);
      totalSistem += v.qty;
      totalFisik += soh;
      totalVariance += variance;
    }
  }

  // 3. Create/Update sheet
  const meta = await sheets.spreadsheets.get({ spreadsheetId });
  const existingTitles = meta.data.sheets.map(s => s.properties.title);

  if (!existingTitles.includes('Stock_Opname')) {
    await sheets.spreadsheets.batchUpdate({
      spreadsheetId,
      requestBody: { requests: [{ addSheet: { properties: { title: 'Stock_Opname' } } }] }
    });
    console.log('Created sheet: Stock_Opname');
  }

  await sheets.spreadsheets.values.clear({ spreadsheetId, range: 'Stock_Opname!A1:I500' });
  await sheets.spreadsheets.values.update({
    spreadsheetId,
    range: 'Stock_Opname!A1',
    valueInputOption: 'USER_ENTERED',
    requestBody: { values: opnameRows }
  });

  console.log(`✓ Stock_Opname populated with ${opnameRows.length - 1} active rack-SKU combinations`);
  console.log(`  Total Sistem: ${totalSistem}`);
  console.log(`  Total Fisik (initialized): ${totalFisik}`);
  console.log(`  Total Variance: ${totalVariance}`);
}

run().catch(console.error);