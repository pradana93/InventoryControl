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

const BASE_URL = 'https://inventory-control-five.vercel.app';

async function run() {
  console.log('=== GENERATING RACK LABELS WITH QR CODES ===');

  // 1. Read Physical_Warehouse for all active racks
  const wh = await sheets.spreadsheets.values.get({ spreadsheetId, range: 'Physical_Warehouse!A1:D200' });
  const whRows = wh.data.values || [];
  const racks = whRows.slice(1)
    .filter(r => r[0] && r[3] === 'Active')
    .map(r => ({
      rackId: String(r[0]).trim(),
      jenisLokasi: String(r[1] || 'RACKING').trim(),
      entitas: String(r[2] || 'Default').trim(),
    }));

  console.log(`Found ${racks.length} active racks`);

  // 2. Read Ledger to get current SKU per rack
  const ledger = await sheets.spreadsheets.values.get({ spreadsheetId, range: 'Ledger!A1:H300' });
  const lRows = ledger.data.values || [];
  const rackSku = new Map();
  for (let i = 1; i < lRows.length; i++) {
    const r = lRows[i];
    if (r[3] && r[2]) {
      const key = String(r[3]).trim();
      const sku = String(r[2]).trim();
      if (!rackSku.has(key)) rackSku.set(key, sku);
    }
  }

  // 3. Read Catalog for SKU barcodes
  const cat = await sheets.spreadsheets.values.get({ spreadsheetId, range: 'Catalog!A1:F200' });
  const cRows = cat.data.values || [];
  const skuBarcode = new Map();
  for (let i = 1; i < cRows.length; i++) {
    const r = cRows[i];
    if (r[1]) skuBarcode.set(String(r[1]).trim().toLowerCase(), String(r[5] || '').trim());
  }

  // 4. Build label rows (matching Rack Labeling 2-column print layout)
  const labelRows = [
    // Header row for the sheet
    ['Pallet Code', 'SKU Name', 'Zone / Area', 'SKU Barcode', 'QR Code URL', 'QR Code Base64', '', '', 
     'Pallet Code', 'SKU Name', 'Zone / Area', 'SKU Barcode', 'QR Code URL', 'QR Code Base64']
  ];

  for (let i = 0; i < racks.length; i += 2) {
    const left = racks[i];
    const right = racks[i + 1];

    const leftSku = rackSku.get(left.rackId) || '-';
    const rightSku = right ? rackSku.get(right.rackId) || '-' : '-';
    const leftBarcode = skuBarcode.get(leftSku.toLowerCase()) || '';
    const rightBarcode = right ? skuBarcode.get(rightSku.toLowerCase()) || '' : '';

    const leftUrl = `${BASE_URL}/inbound/scan/${encodeURIComponent(left.rackId)}`;
    const rightUrl = right ? `${BASE_URL}/inbound/scan/${encodeURIComponent(right.rackId)}` : '';

    // Generate QR code using Google Charts API (returns image URL we can embed)
    // We'll store the URL; for printing, we can use IMAGE() formula in sheets
    const leftQR = `https://chart.googleapis.com/chart?cht=qr&chl=${encodeURIComponent(leftUrl)}&chs=150x150`;
    const rightQR = right ? `https://chart.googleapis.com/chart?cht=qr&chl=${encodeURIComponent(rightUrl)}&chs=150x150` : '';

    labelRows.push([
      left.rackId, leftSku, left.jenisLokasi, leftBarcode, leftUrl, leftQR, '', '',
      right.rackId, rightSku, right?.jenisLokasi || '', rightBarcode, rightUrl, rightQR
    ]);
  }

  // 5. Create/Update Rack_Labels sheet
  const meta = await sheets.spreadsheets.get({ spreadsheetId });
  const existingTitles = meta.data.sheets.map(s => s.properties.title);

  if (!existingTitles.includes('Rack_Labels')) {
    await sheets.spreadsheets.batchUpdate({
      spreadsheetId,
      requestBody: { requests: [{ addSheet: { properties: { title: 'Rack_Labels' } } }] }
    });
    console.log('Created sheet: Rack_Labels');
  }

  await sheets.spreadsheets.values.clear({ spreadsheetId, range: 'Rack_Labels!A1:N500' });
  await sheets.spreadsheets.values.update({
    spreadsheetId,
    range: 'Rack_Labels!A1',
    valueInputOption: 'USER_ENTERED',
    requestBody: { values: labelRows }
  });

  console.log(`✓ Rack_Labels populated with ${labelRows.length - 1} rows (${labelRows.length * 2 - 2} racks)`);
}

run().catch((e) => { console.error('FATAL:', e); process.exit(1); });