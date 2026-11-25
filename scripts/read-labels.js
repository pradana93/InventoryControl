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
  const meta = await sheets.spreadsheets.get({ spreadsheetId });
  console.log('=== ALL SHEETS ===');
  meta.data.sheets.forEach((s) => console.log(' -', s.properties.title, `(id=${s.properties.sheetId}, rows=${s.properties.gridProperties?.rowCount})`));

  // Read Rack Labeling sheet
  const rl = await sheets.spreadsheets.values.get({ spreadsheetId, range: 'Rack Labeling!A1:T50' });
  console.log('\n=== Rack Labeling (A1:T50) ===');
  (rl.data.values || []).forEach((r, i) => {
    console.log(`[${i + 1}]`, JSON.stringify(r));
  });
}

run().catch(console.error);
