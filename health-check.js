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

async function healthCheck() {
  const auth = new JWT({
    email: env.GOOGLE_SERVICE_ACCOUNT_EMAIL,
    key: env.GOOGLE_PRIVATE_KEY?.replace(/\\n/g, '\n'),
    scopes: ['https://www.googleapis.com/auth/spreadsheets.readonly'],
  });
  const sheets = google.sheets({ version: 'v4', auth });
  const spreadsheetId = env.GOOGLE_SHEET_ID;

  const meta = await sheets.spreadsheets.get({ spreadsheetId });
  console.log('=== SPREADSHEET ===');
  console.log('Title:', meta.data.properties.title);
  console.log('Tabs:');
  for (const s of meta.data.sheets) {
    const p = s.properties;
    const grid = p.gridProperties;
    console.log(`  - "${p.title}" (id=${p.sheetId}) rows=${grid?.rowCount} cols=${grid?.columnCount}`);
  }

  const tabs = meta.data.sheets.map(s => s.properties.title);

  for (const tab of tabs) {
    console.log(`\n===== TAB: ${tab} =====`);
    try {
      const res = await sheets.spreadsheets.values.get({
        spreadsheetId,
        range: `${tab}!A1:R6`,
      });
      const rows = res.data.values || [];
      console.log(`First ${rows.length} rows:`);
      rows.forEach((r, i) => console.log(`  ${i + 1}: ${JSON.stringify(r)}`));

      // Count total non-empty data rows
      const full = await sheets.spreadsheets.values.get({
        spreadsheetId,
        range: `${tab}!A:A`,
      });
      const allRows = full.data.values || [];
      console.log(`  Total rows in column A: ${allRows.length}`);
    } catch (e) {
      console.log('  ERROR:', e.message);
    }
  }
}

healthCheck().catch(e => { console.error('FATAL:', e.message); process.exit(1); });