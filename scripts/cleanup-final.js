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

async function getSheetId(name) {
  const meta = await sheets.spreadsheets.get({ spreadsheetId });
  return meta.data.sheets.find((s) => s.properties.title === name).properties.sheetId;
}

async function run() {
  // 1. Remove test ledger entries
  const ledger = await sheets.spreadsheets.values.get({ spreadsheetId, range: 'Ledger!A1:H300' });
  const rows = ledger.data.values || [];
  const toDelete = [];
  rows.forEach((r, i) => {
    const remarks = String(r[7] || '');
    if (remarks.includes('automated sync test') || remarks.includes('Test sync')) toDelete.push(i + 1);
  });
  console.log('Test Ledger rows to delete:', toDelete);

  if (toDelete.length) {
    const sheetId = await getSheetId('Ledger');
    await sheets.spreadsheets.batchUpdate({
      spreadsheetId,
      requestBody: {
        requests: toDelete.sort((a, b) => b - a).map((rowIdx) => ({
          deleteDimension: { range: { sheetId, dimension: 'ROWS', startIndex: rowIdx - 1, endIndex: rowIdx } },
        })),
      },
    });
    console.log('Deleted', toDelete.length, 'test ledger rows');
  }

  // 2. Reset Stock Opname: set SOH = Sistem for all, clear audit fields
  const opname = await sheets.spreadsheets.values.get({ spreadsheetId, range: 'Stock_Opname!A1:I100' });
  const oRows = opname.data.values || [];
  const updates = [];
  for (let i = 1; i < oRows.length; i++) {
    const sistem = parseFloat(String(oRows[i][2] || '0')) || 0;
    updates.push(
      { range: `Stock_Opname!D${i + 1}`, values: [[sistem]] },
      { range: `Stock_Opname!E${i + 1}`, values: [['0']] },
      { range: `Stock_Opname!F${i + 1}`, values: [['100.00%']] },
      { range: `Stock_Opname!G${i + 1}`, values: [['']] },
      { range: `Stock_Opname!H${i + 1}`, values: [['']] },
      { range: `Stock_Opname!I${i + 1}`, values: [['']] }
    );
  }
  if (updates.length) {
    await sheets.spreadsheets.values.batchUpdate({
      spreadsheetId,
      requestBody: { valueInputOption: 'USER_ENTERED', data: updates },
    });
    console.log('Reset', oRows.length - 1, 'opname rows to baseline');
  }
}

run().catch((e) => { console.error('FATAL:', e); process.exit(1); });
