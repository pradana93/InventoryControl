import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { supabaseAdmin } from '@/lib/supabase';
import { getSKUById } from '@/lib/db';

export const dynamic = 'force-dynamic';

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ skuId: string }> }
) {
  try {
    const session = await auth();

    if (!session?.user?.email) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Auth check: Super Admin / Manager only
    if (session.user.role !== 'super-admin' && session.user.role !== 'manager') {
      return NextResponse.json(
        { error: 'Forbidden: Super Admin or Manager role required' },
        { status: 403 }
      );
    }

    const { skuId } = await params;
    const body = await request.json();
    const { activeFlag } = body;

    if (typeof activeFlag !== 'boolean') {
      return NextResponse.json(
        { error: 'Invalid body: activeFlag (boolean) is required' },
        { status: 400 }
      );
    }

    const { data, error } = await supabaseAdmin
      .from('catalog')
      .update({ activeFlag: activeFlag })
      .eq('sku_id', skuId)
      .select('*')
      .maybeSingle();

    if (error) {
      console.error(`Error updating activeFlag for SKU ${skuId}:`, error);
      return NextResponse.json(
        { error: `Failed to update activeFlag for SKU ${skuId}` },
        { status: 500 }
      );
    }

    if (!data) {
      return NextResponse.json({ error: 'SKU not found' }, { status: 404 });
    }

    // Return the updated catalog entry
    return NextResponse.json({
      skuId: data.sku_id,
      namaBarang: data.nama_barang,
      entitas: data.entitas,
      activeFlag: data.activeFlag,
      // Include other relevant fields if needed by client
    });
  } catch (error) {
    console.error('API Error:', error);
    return NextResponse.json(
      { error: 'Internal Server Error', detail: error instanceof Error ? error.message : String(error) },
      { status: 500 }
    );
  }
}
