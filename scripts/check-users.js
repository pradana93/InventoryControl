require('dotenv').config({ path: '.env.local' });
const { google } = require('googleapis');
const bcrypt = require('bcryptjs');

const serviceAccountEmail = process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL;
const privateKey = process.env.GOOGLE_PRIVATE_KEY?.replace(/\\n/g, '\n');
const spreadsheetId = process.env.GOOGLE_SHEET_ID;

const auth = new google.auth.GoogleAuth({
  credentials: { client_email: serviceAccountEmail, private_key: privateKey },
  scopes: ['https://www.googleapis.com/auth/spreadsheets'],
});
const sheets = google.sheets({ version: 'v4', auth });

async function main() {
  const res = await sheets.spreadsheets.values.get({
    spreadsheetId,
    range: 'Users!A:F',
  });
  const rows = res.data.values || [];
  console.log('Sheet rows:', rows.length);
  for (let i = 0; i < rows.length; i++) {
    console.log(`Row ${i + 1}:`, JSON.stringify(rows[i].slice(0, 4)));
    if (i > 0 && rows[i][1]) {
      const match = await bcrypt.compare('majestap93', rows[i][1]);
      console.log(`  bcrypt.compare("majestap93") =>`, match);
    }
  }
}

main().catch((e) => console.error('ERR', e));
