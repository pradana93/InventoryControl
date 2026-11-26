import { NextResponse } from 'next/server';
import { authenticateUser } from '@/lib/user-service';
import { supabaseAdmin } from '@/lib/supabase';

export async function GET() {
  const results: Record<string, unknown> = {};

  // Check supabase admin client
  results.hasSupabaseUrl = !!process.env.NEXT_PUBLIC_SUPABASE_URL;
  results.hasServiceRoleKey = !!process.env.SUPABASE_SERVICE_ROLE_KEY;

  try {
    const { data, error } = await supabaseAdmin
      .from('users')
      .select('email, role, password_hash')
      .ilike('email', 'majestap93@gmail.com');
    results.userQueryError = error?.message || null;
    results.usersFound = (data || []).map((u: { email: string; role: string; password_hash: string }) => ({
      email: u.email,
      role: u.role,
      hashPrefix: u.password_hash ? u.password_hash.substring(0, 10) : null,
      hashLength: u.password_hash ? u.password_hash.length : 0,
    }));
  } catch (e) {
    results.queryException = e instanceof Error ? e.message : String(e);
  }

  try {
    const authResult = await authenticateUser('majestap93@gmail.com', 'inventory123');
    results.authSuccess = !!authResult;
    results.authUser = authResult?.user || null;
  } catch (e) {
    results.authException = e instanceof Error ? e.message : String(e);
  }

  return NextResponse.json(results);
}