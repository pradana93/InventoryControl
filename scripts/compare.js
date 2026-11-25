require('dotenv').config({ path: '.env.local' });
const { google } = require('googleapis');
const auth = new google.auth.GoogleAuth({
  credentials: {
    client_email: process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL,
    private_key: process.env.GOOGLE_PRIVATE_KEY?.replace(/\n/g, '\n'),
  },
  scopes: ['https://www.googleapis.com/auth/spreadsheets'],
});
const sheets = google.sheets({ version: 'v4', auth });
const spreadsheetId = process.env.GOOGLE_SHEET_ID;

async function run() {
  const inv = await sheets.spreadsheets.values.get({ spreadsheetId, range: 'Inventory!A4:E40' });
  console.log('=== INVENTORY (rows with qty) ===');
  (inv.data.values || []).forEach((r) => {
    const qty = parseInt(r[2] || '0', 10) || 0;
    if (qty > 0) console.log(`${r[1]} | ${r[0]} | qty=${r[2]} | in=${r[3]} | exp=${r[4]}`);
  });

  const inb = await sheets.spreadsheets.values.get({ spreadsheetId, range: 'Inbound!A2:R40' });
  console.log('\n=== INBOUND ===');
  (inb.data.values || []).forEach((r) => {
    const racks = [];
    for (let i = 0; i < 6; i++) {
      const rk = r[6 + i * 2], q = r[7 + i * 2];
      if (rk && q) racks.push(`${rk}:${q}`);
    }
    if (r[1]) console.log(`${r[1]} | qty=${r[2]} | racks=${racks.join(', ')}`);
  });
}

run().catch(console.error);
