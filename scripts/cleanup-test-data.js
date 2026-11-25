const { google } = require('googleapis');
require('dotenv').config({ path: '.env.local' });
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

async function cleanup() {
  // 1. Find test Inbound rows
  const inbound = await sheets.spreadsheets.values.get({ spreadsheetId, range: 'Inbound!A1:R200' });
  const rows = inbound.data.values || [];
  const toDelete = [];
  rows.forEach((r, i) => {
    const sj = String(r[5] || '');
    if (sj === 'SJ-TEST-SYNC' || sj === 'SJ-TEST-001') toDelete.push(i + 1);
  });
  console.log('Test Inbound rows to delete (1-based):', toDelete);

  // 2. Find A0101A inventory row
  const inv = await sheets.spreadsheets.values.get({ spreadsheetId, range: 'Inventory!A1:K130' });
  const invRows = inv.data.values || [];
  const invIdx = invRows.findIndex((r) => r[1] === 'A0101A');
  console.log('A0101A inventory row (1-based):', invIdx + 1, '=', invRows[invIdx]);

  // 3. Delete test rows from Inbound
  const sheetId = await getSheetId('Inbound');
  const requests = toDelete
    .sort((a, b) => b - a)
    .map((rowIdx) => ({
      deleteDimension: {
        range: { sheetId, dimension: 'ROWS', startIndex: rowIdx - 1, endIndex: rowIdx },
      },
    }));

  if (requests.length > 0) {
    await sheets.spreadsheets.batchUpdate({ spreadsheetId, requestBody: { requests } });
    console.log('Deleted', requests.length, 'test row(s) from Inbound');
  }

  // 4. Reset A0101A inventory
  await sheets.spreadsheets.values.batchUpdate({
    spreadsheetId,
    requestBody: {
      valueInputOption: 'USER_ENTERED',
      data: [
        { range: 'Inventory!C' + (invIdx + 1), values: [['2000']] },
        { range: 'Inventory!D' + (invIdx + 1), values: [['11/24/2026 11:35:25']] },
        { range: 'Inventory!E' + (invIdx + 1), values: [['20 Agu 2027']] },
      ],
    },
  });
  console.log('Reset A0101A qty to 2000');

  // Verify
  const check = await sheets.spreadsheets.values.get({ spreadsheetId, range: 'Inventory!A4:E4' });
  console.log('Verify:', check.data.values);
}

cleanup().catch((e) => {
  console.error('FATAL:', e);
  process.exit(1);
});
