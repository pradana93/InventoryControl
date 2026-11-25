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

async function testSKUNames() {
  const auth = new JWT({
    email: env.GOOGLE_SERVICE_ACCOUNT_EMAIL,
    key: env.GOOGLE_PRIVATE_KEY?.replace(/\\n/g, '\n'),
    scopes: ['https://www.googleapis.com/auth/spreadsheets'],
  });
  const sheets = google.sheets({ version: 'v4', auth });
  const spreadsheetId = env.GOOGLE_SHEET_ID;

  const res = await sheets.spreadsheets.values.get({
    spreadsheetId,
    range: 'Master Data!A4:J50',
  });
  const rows = res.data.values || [];
  const skus = new Set();
  for (const r of rows) {
    if (r[1]) skus.add(r[1].trim());
    if (r[6]) skus.add(r[6].trim());
  }
  console.log(`Found ${skus.size} SKUs:`);
  console.log(Array.from(skus).slice(0, 15));
}

testSKUNames();
