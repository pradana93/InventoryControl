import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { updateUserRole } from '@/lib/user-service';

export const dynamic = 'force-dynamic';

/**
 * PUT /api/users/[email]
 * Update a user's role (Super Admin only)
 */
export async function PUT(
  request: Request,
  { params }: { params: Promise<{ email: string }> }
) {
  try {
    const session = await auth();
    
    if (!session?.user?.email) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    
    // Only Super Admin can update user roles
    if (session.user.role !== 'super-admin') {
      return NextResponse.json({ error: 'Forbidden: Super Admin only' }, { status: 403 });
    }

    const { email } = await params;
    const body = await request.json();
    const { role } = body;

    // Validation
    if (!role) {
      return NextResponse.json(
        { error: 'Role wajib diisi' },
        { status: 400 }
      );
    }

    if (!['super-admin', 'manager', 'operator'].includes(role)) {
      return NextResponse.json(
        { error: 'Role tidak valid. Pilih: super-admin, manager, atau operator' },
        { status: 400 }
      );
    }

    const result = await updateUserRole(email, role);

    if (!result.success) {
      return NextResponse.json({ error: result.message }, { status: 400 });
    }

    return NextResponse.json({ success: true, message: 'Role pengguna berhasil diperbarui' });
  } catch (error) {
    console.error('Error updating user role:', error);
    return NextResponse.json(
      { error: 'Gagal memperbarui role pengguna', detail: error instanceof Error ? error.message : String(error) },
      { status: 500 }
    );
  }
}