const fs = require('fs');
const { google } = require('googleapis');
const { JWT } = require('google-auth-library');

const envContent = fs.readFileSync('.env.local', 'utf8');
const env = {};
envContent.split('\n').forEach(line => {
  const match = line.match(/^\s*([\w.-]+)\s*=\s*(.*)?\s*$/);
  if (match) {
    let val = match[2] || '';
    if (val.startsWith('"') && val.endsWith('"')) val = val.slice(1, -1);
    env[match[1]] = val;
  }
});

async function inspectInventoryFormulas() {
  const auth = new JWT({
    email: env.GOOGLE_SERVICE_ACCOUNT_EMAIL,
    key: env.GOOGLE_PRIVATE_KEY?.replace(/\\n/g, '\n'),
    scopes: ['https://www.googleapis.com/auth/spreadsheets.readonly'],
  });
  const sheets = google.sheets({ version: 'v4', auth });
  const spreadsheetId = env.GOOGLE_SHEET_ID;

  // Read the first 10 rows (including headers and some data) of the Inventory sheet, requesting formulas
  const res = await sheets.spreadsheets.values.get({
    spreadsheetId,
    range: 'Inventory!A1:Z10',
    valueRenderOption: 'FORMULA',
  });
  
  console.log('--- INVENTORY SHEET (FORMULAS, Rows 1-10) ---');
  const rows = res.data.values || [];
  rows.forEach((row, i) => console.log(`${i+1}:`, JSON.stringify(row)));

  // Also read as UNFORMATTED_VALUE to see raw numbers, especially for dates
  const unformattedRes = await sheets.spreadsheets.values.get({
    spreadsheetId,
    range: 'Inventory!A1:Z10',
    valueRenderOption: 'UNFORMATTED_VALUE',
    dateTimeRenderOption: 'SERIAL_NUMBER',
  });
  console.log('\n--- INVENTORY SHEET (UNFORMATTED_VALUES, Rows 1-10) ---');
  const unformattedRows = unformattedRes.data.values || [];
  unformattedRows.forEach((row, i) => console.log(`${i+1}:`, JSON.stringify(row)));
}

inspectInventoryFormulas().catch(e => { console.error('FATAL:', e.message); process.exit(1); });