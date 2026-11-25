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
  const l = await sheets.spreadsheets.values.get({ spreadsheetId, range: 'Ledger!A1:H60' });
  const rows = l.data.values || [];
  console.log('LEDGER rows:', rows.length);
  rows.forEach((r, i) => console.log(i, JSON.stringify(r)));

  // Also check the Legacy Inventory to compare
  const inv = await sheets.spreadsheets.values.get({ spreadsheetId, range: 'Inventory!A1:K140' });
  const invRows = inv.data.values || [];
  let total = 0, nonzero = 0;
  const skus = new Set();
  invRows.slice(3).forEach(r => {
    if (r[1] && r[0]) {
      const q = parseInt(r[2] || '0', 10) || 0;
      total += q;
      if (q > 0) { nonzero++; skus.add(r[0]); }
    }
  });
  console.log('\nLEGACY Inventory: rows with stock =', nonzero, ', total qty =', total, ', unique SKUs =', skus.size);

  // Check Inbound
  const inb = await sheets.spreadsheets.values.get({ spreadsheetId, range: 'Inbound!A1:R60' });
  const inbRows = (inb.data.values || []).slice(1);
  console.log('\nINBOUND entries:', inbRows.length);
  let inbTotal = 0;
  inbRows.forEach(r => { inbTotal += parseInt(r[2] || '0', 10) || 0; });
  console.log('INBOUND total qty:', inbTotal);
}

run().catch(console.error);
