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

function parseDateToISO(raw) {
  if (!raw) return '';
  const s = String(raw).trim();
  // Already ISO (YYYY-MM-DD)
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
  // DD-MMM-YYYY (e.g. 12-Dec-2026) or DD MMM YYYY (20 Agu 2027)
  const monthsId = { jan:1, feb:2, mar:3, apr:4, mei:5, jun:6, jul:7, ags:8, agu:8, sep:9, okt:10, nov:11, des:12 };
  const m1 = s.match(/^(\d{1,2})[-\s]([A-Za-z]+)[-\s](\d{4})$/);
  if (m1) {
    const d = parseInt(m1[1], 10);
    const mon = monthsId[m1[2].toLowerCase().slice(0,3)];
    const y = m1[3];
    if (mon) return `${y}-${String(mon).padStart(2,'0')}-${String(d).padStart(2,'0')}`;
  }
  // JavaScript Date fallback
  const dt = new Date(s);
  if (!isNaN(dt.getTime())) return dt.toISOString().slice(0, 10);
  return s;
}

async function run() {
  console.log('=== RE-SEEDING LEDGER FROM AUTHORITATIVE INVENTORY SHEET ===\n');

  // 1. Read the legacy Inventory sheet (the real source of current truth)
  const inv = await sheets.spreadsheets.values.get({ spreadsheetId, range: 'Inventory!A1:K200' });
  const invRows = inv.data.values || [];
  const headerIdx = invRows.findIndex((r) => String(r[0] || '').trim() === 'Nama Barang');
  console.log('Inventory header at row index:', headerIdx);

  const dataRows = invRows.slice(headerIdx + 1);

  // 2. Rebuild the Ledger
  const ledgerRows = [
    ['Record_ID', 'Timestamp', 'SKU_Name', 'Rack_ID', 'Qty_In', 'Expired_Date', 'SJ_Number', 'Remarks'],
  ];

  let recId = 1;
  let totalQty = 0;
  const skuSet = new Set();
  for (const r of dataRows) {
    const sku = String(r[0] || '').trim();
    const rack = String(r[1] || '').trim();
    const qty = parseInt(String(r[2] || '0'), 10) || 0;
    const tInbound = String(r[3] || '').trim();
    const tExpiry = parseDateToISO(String(r[4] || '').trim());

    if (!sku || !rack) continue;
    if (qty <= 0) continue;

    ledgerRows.push([
      `REC-${String(recId++).padStart(4, '0')}`,
      tInbound || new Date().toISOString(),
      sku,
      rack,
      String(qty),
      tExpiry,
      '',
      'Migrated from Inventory sheet',
    ]);
    totalQty += qty;
    skuSet.add(sku);
  }

  console.log(`Ledger entries to write: ${ledgerRows.length - 1}`);
  console.log(`Total qty: ${totalQty}`);
  console.log(`Unique SKUs: ${skuSet.size}`);

  // 3. Write the corrected Ledger (replace entirely)
  await sheets.spreadsheets.values.clear({ spreadsheetId, range: 'Ledger!A1:H1000' });
  await sheets.spreadsheets.values.update({
    spreadsheetId,
    range: 'Ledger!A1',
    valueInputOption: 'USER_ENTERED',
    requestBody: { values: ledgerRows },
  });
  console.log('\n✓ Ledger re-seeded from authoritative Inventory data');
}

run().catch((e) => {
  console.error('FATAL:', e);
  process.exit(1);
});
