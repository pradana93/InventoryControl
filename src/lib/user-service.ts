import { supabaseAdmin } from './supabase';
import bcrypt from 'bcryptjs';

export interface UserRecord {
  email: string;
  name: string;
  role: 'super-admin' | 'manager' | 'operator';
  createdAt: string;
  createdBy: string;
}

export const SUPER_ADMIN_EMAIL = process.env.SUPER_ADMIN_EMAIL || 'majestap93@gmail.com';
export const DEFAULT_SUPER_ADMIN_PASSWORD =
  process.env.DEFAULT_SUPER_ADMIN_PASSWORD || 'inventory123';

interface RawUserRow {
  email: string;
  passwordHash: string;
  name: string;
  role: 'super-admin' | 'manager' | 'operator';
  createdAt: string;
  createdBy: string;
}

/**
 * Ensures the primary Super Admin exists. Idempotent — safe to call on every
 * auth request.
 */
export async function ensureSuperAdmin(): Promise<void> {
  const { data, error } = await supabaseAdmin
    .from('users')
    .select('email')
    .ilike('email', SUPER_ADMIN_EMAIL)
    .maybeSingle();
  if (error) {
    console.error('Error checking super admin:', error.message);
    return;
  }
  if (data) return;

  const hash = await bcrypt.hash(DEFAULT_SUPER_ADMIN_PASSWORD, 10);
  const { error: insErr } = await supabaseAdmin.from('users').insert({
    email: SUPER_ADMIN_EMAIL,
    password_hash: hash,
    name: 'Super Admin',
    role: 'super-admin',
    entity: null,
  });
  if (insErr) console.error('Error seeding super admin:', insErr.message);
}

// Legacy no-op kept for backward compatibility (no sheets to create anymore).
export async function ensureUsersSheet(): Promise<void> {
  await ensureSuperAdmin();
}

async function getAllUsersInternal(): Promise<RawUserRow[]> {
  const { data, error } = await supabaseAdmin
    .from('users')
    .select('email, password_hash, name, role, created_at');
  if (error) {
    console.error('Error reading users:', error.message);
    return [];
  }
  return (data || []).map((r: any) => ({
    email: String(r.email || '').trim(),
    passwordHash: String(r.password_hash || '').trim(),
    name: String(r.name || '').trim(),
    role: (String(r.role || 'operator').trim() as any) || 'operator',
    createdAt: r.created_at ? new Date(r.created_at).toISOString() : '',
    createdBy: 'system',
  }));
}

/**
 * Public list of users (without password hashes)
 */
export async function getUsers(): Promise<UserRecord[]> {
  await ensureSuperAdmin();
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
 * Authenticates user credentials against the users table.
 */
export async function authenticateUser(
  email: string,
  plainPassword: string
): Promise<{ user: UserRecord } | null> {
  await ensureSuperAdmin();
  const { data, error } = await supabaseAdmin
    .from('users')
    .select('email, password_hash, name, role, created_at')
    .ilike('email', email.toLowerCase().trim())
    .maybeSingle();

  if (error || !data) return null;
  if (!data.password_hash) return null;

  const match = await bcrypt.compare(plainPassword, data.password_hash);
  if (!match) return null;

  return {
    user: {
      email: String(data.email),
      name: String(data.name || data.email),
      role: data.role as UserRecord['role'],
      createdAt: data.created_at ? new Date(data.created_at).toISOString() : '',
      createdBy: 'system',
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
  await ensureSuperAdmin();
  const cleanEmail = data.email.toLowerCase().trim();

  const { data: existing } = await supabaseAdmin
    .from('users')
    .select('email')
    .ilike('email', cleanEmail)
    .maybeSingle();
  if (existing) {
    return { success: false, message: 'Email sudah terdaftar.' };
  }

  const hash = await bcrypt.hash(data.password, 10);

  const { error } = await supabaseAdmin.from('users').insert({
    email: cleanEmail,
    password_hash: hash,
    name: data.name.trim(),
    role: data.role,
    entity: null,
  });

  if (error) return { success: false, message: error.message };

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

  const { error } = await supabaseAdmin.from('users').delete().ilike('email', cleanEmail);
  if (error) return { success: false, message: error.message };
  return { success: true };
}

/**
 * Updates a user's role (Super Admin only)
 */
export async function updateUserRole(
  email: string,
  newRole: 'super-admin' | 'manager' | 'operator'
): Promise<{ success: boolean; message?: string }> {
  const cleanEmail = email.toLowerCase().trim();
  if (cleanEmail === SUPER_ADMIN_EMAIL.toLowerCase()) {
    return { success: false, message: 'Role Super Admin utama tidak dapat diubah.' };
  }

  const { data, error } = await supabaseAdmin
    .from('users')
    .update({ role: newRole, updated_at: new Date().toISOString() })
    .ilike('email', cleanEmail)
    .select('email');
  if (error) return { success: false, message: error.message };
  if (!data || data.length === 0) {
    return { success: false, message: 'Pengguna tidak ditemukan.' };
  }
  return { success: true };
}

/**
 * Resets or updates a user's password
 */
export async function updateUserPassword(
  email: string,
  newPassword: string
): Promise<{ success: boolean; message?: string }> {
  const cleanEmail = email.toLowerCase().trim();
  const hash = await bcrypt.hash(newPassword, 10);

  const { data, error } = await supabaseAdmin
    .from('users')
    .update({ password_hash: hash, updated_at: new Date().toISOString() })
    .ilike('email', cleanEmail)
    .select('email');
  if (error) return { success: false, message: error.message };
  if (!data || data.length === 0) {
    return { success: false, message: 'Pengguna tidak ditemukan.' };
  }
  return { success: true };
}
