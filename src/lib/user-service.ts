import { getSheetsClient, readSheet, appendRow, SHEETS } from './google-sheets';
import bcrypt from 'bcryptjs';

export interface UserRecord {
  email: string;
  name: string;
  role: 'super-admin' | 'manager' | 'operator';
  createdAt: string;
  createdBy: string;
}

export const SUPER_ADMIN_EMAIL = process.env.SUPER_ADMIN_EMAIL || 'majestap93@gmail.com';
export const DEFAULT_SUPER_ADMIN_PASSWORD = process.env.DEFAULT_SUPER_ADMIN_PASSWORD!;

/**
 * Ensures the Users sheet exists in Google Sheets with appropriate headers
 * and seeds the initial Super Admin account if not present.
 */
export async function ensureUsersSheet(): Promise<void> {
  const client = await getSheetsClient();
  const spreadsheetId = process.env.GOOGLE_SHEET_ID!;

  // 1. Get spreadsheet metadata to check if 'Users' sheet exists
  const meta = await client.spreadsheets.get({ spreadsheetId });
  const sheetExists = meta.data.sheets?.some(
    (s) => s.properties?.title?.toLowerCase() === SHEETS.USERS.toLowerCase()
  );

  if (!sheetExists) {
    // Create sheet
    await client.spreadsheets.batchUpdate({
      spreadsheetId,
      requestBody: {
        requests: [
          {
            addSheet: {
              properties: {
                title: SHEETS.USERS,
                gridProperties: { rowCount: 100, columnCount: 10 },
              },
            },
          },
        ],
      },
    });

    // Write header
    await client.spreadsheets.values.update({
      spreadsheetId,
      range: `${SHEETS.USERS}!A1:F1`,
      valueInputOption: 'USER_ENTERED',
      requestBody: {
        values: [['Email', 'PasswordHash', 'Name', 'Role', 'CreatedAt', 'CreatedBy']],
      },
    });
  }

  // 2. Check if Super Admin exists
  const users = await getAllUsersInternal();
  const superAdmin = users.find((u) => u.email.toLowerCase() === SUPER_ADMIN_EMAIL.toLowerCase());

  if (!superAdmin) {
    const salt = await bcrypt.genSalt(10);
    const hash = await bcrypt.hash(DEFAULT_SUPER_ADMIN_PASSWORD, salt);
    await appendRow(SHEETS.USERS, [
      SUPER_ADMIN_EMAIL,
      hash,
      'Super Admin',
      'super-admin',
      new Date().toISOString(),
      'system',
    ]);
  }
}

interface RawUserRow {
  rowIndex: number; // 1-indexed in sheet
  email: string;
  passwordHash: string;
  name: string;
  role: 'super-admin' | 'manager' | 'operator';
  createdAt: string;
  createdBy: string;
}

async function getAllUsersInternal(): Promise<RawUserRow[]> {
  try {
    const rows = await readSheet(SHEETS.USERS);
    if (!rows || rows.length <= 1) return [];

    // Header is row 0 (A1:F1), data starts row 1 (row 2 in spreadsheet)
    return rows.slice(1).map((row, idx) => ({
      rowIndex: idx + 2,
      email: String(row[0] || '').trim(),
      passwordHash: String(row[1] || '').trim(),
      name: String(row[2] || '').trim(),
      role: (String(row[3] || 'operator').trim() as any) || 'operator',
      createdAt: String(row[4] || '').trim(),
      createdBy: String(row[5] || '').trim(),
    })).filter((u) => u.email.length > 0);
  } catch (err) {
    console.error('Error reading Users sheet:', err);
    return [];
  }
}

/**
 * Public list of users (without password hashes)
 */
export async function getUsers(): Promise<UserRecord[]> {
  await ensureUsersSheet();
  const raw = await getAllUsersInternal();
  return raw.map((u) => ({
    email: u.email,
    name: u.name,
    role: u.role,
    createdAt: u.createdAt,
    createdBy: u.createdBy,
  }));
}

/**
 * Authenticates user credentials against the Users sheet
 */
export async function authenticateUser(
  email: string,
  plainPassword: string
): Promise<{ user: UserRecord } | null> {
  console.log(`[auth-debug] authenticateUser called for email: ${email}`);
  await ensureUsersSheet();
  const users = await getAllUsersInternal();
  console.log(`[auth-debug] Total users found: ${users.length}`);
  users.forEach((u, i) => console.log(`[auth-debug] User[${i}]: email=${u.email}, hashLen=${u.passwordHash?.length}`));

  const found = users.find((u) => u.email.toLowerCase() === email.toLowerCase().trim());
  if (!found) {
    console.log(`[auth-debug] User not found for email: ${email}`);
    return null;
  }

  const match = await bcrypt.compare(plainPassword, found.passwordHash);
  console.log(`[auth-debug] Password match result: ${match}`);
  if (!match) return null;

  return {
    user: {
      email: found.email,
      name: found.name,
      role: found.role,
      createdAt: found.createdAt,
      createdBy: found.createdBy,
    },
  };
}

/**
 * Creates a new user (Only Super Admin can do this)
 */
export async function createUser(data: {
  email: string;
  password: string;
  name: string;
  role: 'super-admin' | 'manager' | 'operator';
  createdBy: string;
}): Promise<{ success: boolean; message?: string }> {
  await ensureUsersSheet();
  const cleanEmail = data.email.toLowerCase().trim();

  const users = await getAllUsersInternal();
  if (users.some((u) => u.email.toLowerCase() === cleanEmail)) {
    return { success: false, message: 'Email sudah terdaftar.' };
  }

  const salt = await bcrypt.genSalt(10);
  const hash = await bcrypt.hash(data.password, salt);

  await appendRow(SHEETS.USERS, [
    cleanEmail,
    hash,
    data.name.trim(),
    data.role,
    new Date().toISOString(),
    data.createdBy,
  ]);

  return { success: true };
}

/**
 * Deletes a user (Cannot delete the main Super Admin)
 */
export async function deleteUser(email: string): Promise<{ success: boolean; message?: string }> {
  const cleanEmail = email.toLowerCase().trim();
  if (cleanEmail === SUPER_ADMIN_EMAIL.toLowerCase()) {
    return { success: false, message: 'Super Admin utama tidak dapat dihapus.' };
  }

  await ensureUsersSheet();
  const client = await getSheetsClient();
  const spreadsheetId = process.env.GOOGLE_SHEET_ID!;

  const rows = await readSheet(SHEETS.USERS);
  // Find which row matches
  let targetRowIndex = -1;
  for (let i = 1; i < rows.length; i++) {
    if (String(rows[i][0] || '').toLowerCase().trim() === cleanEmail) {
      targetRowIndex = i + 1; // 1-indexed for sheets
      break;
    }
  }

  if (targetRowIndex === -1) {
    return { success: false, message: 'Pengguna tidak ditemukan.' };
  }

  // Get sheetId of 'Users' tab
  const meta = await client.spreadsheets.get({ spreadsheetId });
  const sheet = meta.data.sheets?.find(
    (s) => s.properties?.title?.toLowerCase() === SHEETS.USERS.toLowerCase()
  );
  const sheetId = sheet?.properties?.sheetId;

  if (sheetId === undefined) {
    return { success: false, message: 'Lembar Users tidak ditemukan.' };
  }

  // Delete row in Google Sheets
  await client.spreadsheets.batchUpdate({
    spreadsheetId,
    requestBody: {
      requests: [
        {
          deleteDimension: {
            range: {
              sheetId,
              dimension: 'ROWS',
              startIndex: targetRowIndex - 1, // 0-indexed inclusive
              endIndex: targetRowIndex,       // 0-indexed exclusive
            },
          },
        },
      ],
    },
  });

  return { success: true };
}

/**
 * Resets or updates a user's password
 */
export async function updateUserPassword(
  email: string,
  newPassword: string
): Promise<{ success: boolean; message?: string }> {
  await ensureUsersSheet();
  const client = await getSheetsClient();
  const spreadsheetId = process.env.GOOGLE_SHEET_ID!;
  const cleanEmail = email.toLowerCase().trim();

  const rows = await readSheet(SHEETS.USERS);
  let targetRowIndex = -1;
  for (let i = 1; i < rows.length; i++) {
    if (String(rows[i][0] || '').toLowerCase().trim() === cleanEmail) {
      targetRowIndex = i + 1;
      break;
    }
  }

  if (targetRowIndex === -1) {
    return { success: false, message: 'Pengguna tidak ditemukan.' };
  }

  const salt = await bcrypt.genSalt(10);
  const hash = await bcrypt.hash(newPassword, salt);

  await client.spreadsheets.values.update({
    spreadsheetId,
    range: `${SHEETS.USERS}!B${targetRowIndex}`,
    valueInputOption: 'USER_ENTERED',
    requestBody: {
      values: [[hash]],
    },
  });

  return { success: true };
}