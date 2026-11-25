require('dotenv').config({ path: '.env.local' });
const { google } = require('googleapis');
const fs = require('fs');

// Load service account credentials from environment
const serviceAccountEmail = process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL;
const privateKey = process.env.GOOGLE_PRIVATE_KEY?.replace(/\\n/g, '\n');
const spreadsheetId = process.env.GOOGLE_SHEET_ID;

if (!serviceAccountEmail || !privateKey || !spreadsheetId) {
  console.error('Missing required environment variables');
  process.exit(1);
}

const auth = new google.auth.GoogleAuth({
  credentials: {
    client_email: serviceAccountEmail,
    private_key: privateKey,
  },
  scopes: ['https://www.googleapis.com/auth/spreadsheets'],
});

const sheets = google.sheets({ version: 'v4', auth });

async function resetPassword() {
  try {
    // Read the Users sheet to find the super admin row
    const response = await sheets.spreadsheets.values.get({
      spreadsheetId,
      range: 'Users!A:F',
    });

    const rows = response.data.values;
    if (!rows || rows.length <= 1) {
      console.log('No users found in sheet');
      return;
    }

    // Find the super admin row (skip header row 0)
    let targetRowIndex = -1;
    for (let i = 1; i < rows.length; i++) {
      if (rows[i][0]?.toLowerCase().trim() === 'majestap93@gmail.com') {
        targetRowIndex = i + 1; // 1-indexed for sheets
        break;
      }
    }

    if (targetRowIndex === -1) {
      console.log('Super admin not found in Users sheet');
      return;
    }

    console.log(`Found super admin at row ${targetRowIndex}`);

    // Generate new bcrypt hash for password "majestap93"
    const bcrypt = require('bcryptjs');
    const salt = await bcrypt.genSalt(10);
    const hash = await bcrypt.hash('majestap93', salt);
    console.log(`New hash: ${hash}`);

    // Update the password hash in column B
    await sheets.spreadsheets.values.update({
      spreadsheetId,
      range: `Users!B${targetRowIndex}`,
      valueInputOption: 'USER_ENTERED',
      requestBody: {
        values: [[hash]],
      },
    });

    console.log('Password updated successfully!');
  } catch (error) {
    console.error('Error:', error);
  }
}

resetPassword();