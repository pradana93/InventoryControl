import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';
import bcrypt from 'bcryptjs';

export async function GET() {
  const password = 'inventory123';
  const hash = await bcrypt.hash(password, 10);
  
  const { error } = await supabaseAdmin
    .from('users')
    .update({ password_hash: hash })
    .ilike('email', 'majestap93@gmail.com');
    
  return NextResponse.json({ success: !error, error: error?.message, hashLength: hash.length, hashPrefix: hash.substring(0, 10) });
}