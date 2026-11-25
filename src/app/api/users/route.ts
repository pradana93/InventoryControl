import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { getUsers, createUser } from '@/lib/user-service';

export const dynamic = 'force-dynamic';

/**
 * GET /api/users
 * List all users (Super Admin only)
 */
export async function GET() {
  try {
    const session = await auth();
    
    if (!session?.user?.email) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    
    // Only Super Admin can view user list
    if (session.user.role !== 'super-admin') {
      return NextResponse.json({ error: 'Forbidden: Super Admin only' }, { status: 403 });
    }

    const users = await getUsers();
    
    return NextResponse.json({ users });
  } catch (error) {
    console.error('Error fetching users:', error);
    return NextResponse.json(
      { error: 'Gagal mengambil daftar pengguna', detail: error instanceof Error ? error.message : String(error) },
      { status: 500 }
    );
  }
}

/**
 * POST /api/users
 * Create a new user (Super Admin only)
 */
export async function POST(request: Request) {
  try {
    const session = await auth();
    
    if (!session?.user?.email) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    
    // Only Super Admin can create users
    if (session.user.role !== 'super-admin') {
      return NextResponse.json({ error: 'Forbidden: Super Admin only' }, { status: 403 });
    }

    const body = await request.json();
    const { email, password, name, role } = body;

    // Validation
    if (!email || !password || !name || !role) {
      return NextResponse.json(
        { error: 'Semua field wajib diisi: email, password, name, role' },
        { status: 400 }
      );
    }

    if (!['super-admin', 'manager', 'operator'].includes(role)) {
      return NextResponse.json(
        { error: 'Role tidak valid. Pilih: super-admin, manager, atau operator' },
        { status: 400 }
      );
    }

    if (password.length < 6) {
      return NextResponse.json(
        { error: 'Password minimal 6 karakter' },
        { status: 400 }
      );
    }

    const result = await createUser({
      email: email.toLowerCase().trim(),
      password,
      name: name.trim(),
      role,
      createdBy: session.user.email,
    });

    if (!result.success) {
      return NextResponse.json({ error: result.message }, { status: 400 });
    }

    return NextResponse.json({ success: true, message: 'Pengguna berhasil dibuat' });
  } catch (error) {
    console.error('Error creating user:', error);
    return NextResponse.json(
      { error: 'Gagal membuat pengguna', detail: error instanceof Error ? error.message : String(error) },
      { status: 500 }
    );
  }
}