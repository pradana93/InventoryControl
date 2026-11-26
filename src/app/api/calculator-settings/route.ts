import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { getCatalog, CatalogEntry } from '@/lib/db';
import { supabaseAdmin } from '@/lib/supabase';

// Helper to validate positive integers
const isPositiveInteger = (value: unknown): value is number => {
  return typeof value === 'number' && Number.isInteger(value) && value > 0;
};

export const dynamic = 'force-dynamic';

// GET /api/calculator-settings
// Returns catalog entries with lead time and safety stock, protected for Super Admin/Manager
export async function GET() {
  try {
    const session = await auth();

    if (!session?.user?.email) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Check role
    if (session.user.role !== 'super-admin' && session.user.role !== 'manager') {
      return NextResponse.json({ error: 'Forbidden: Only Super Admins and Managers can access this resource' }, { status: 403 });
    }

    const catalogEntries = await getCatalog();

    const settings = catalogEntries.map((entry: CatalogEntry) => ({
      skuId: entry.skuId,
      namaBarang: entry.namaBarang,
      entitas: entry.entitas,
      leadTimeDays: entry.leadTimeDays,
      safetyStockDays: entry.safetyStockDays,
    }));

    return NextResponse.json(settings);
  } catch (error) {
    console.error('Error fetching calculator settings:', error);
    return NextResponse.json(
      { error: 'Gagal mengambil pengaturan kalkulator' },
      { status: 500 }
    );
  }
}

// PUT /api/calculator-settings
// Accepts batch updates for leadTimeDays and safetyStockDays, protected for Super Admin/Manager
export async function PUT(request: Request) {
  try {
    const session = await auth();

    if (!session?.user?.email) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Check role
    if (session.user.role !== 'super-admin' && session.user.role !== 'manager') {
      return NextResponse.json({ error: 'Forbidden: Only Super Admins and Managers can access this resource' }, { status: 403 });
    }

    const updates: Array<{ skuId: string; leadTimeDays?: number; safetyStockDays?: number }> = await request.json();

    const updatedRows: CatalogEntry[] = [];
    const errors: string[] = [];

    for (const update of updates) {
      const { skuId, leadTimeDays, safetyStockDays } = update;

      const patchData: { lead_time_days?: number; safety_stock_days?: number } = {};

      // Validate and prepare leadTimeDays
      if (leadTimeDays !== undefined) {
        if (!isPositiveInteger(leadTimeDays)) {
          errors.push(`Invalid leadTimeDays for SKU ${skuId}: must be a positive integer.`);
          continue;
        }
        patchData.lead_time_days = leadTimeDays;
      }

      // Validate and prepare safetyStockDays
      if (safetyStockDays !== undefined) {
        if (!isPositiveInteger(safetyStockDays)) {
          errors.push(`Invalid safetyStockDays for SKU ${skuId}: must be a positive integer.`);
          continue;
        }
        patchData.safety_stock_days = safetyStockDays;
      }

      // Only proceed if there's something to update
      if (Object.keys(patchData).length > 0) {
        const { data, error } = await supabaseAdmin
          .from('catalog')
          .update(patchData)
          .eq('sku_id', skuId)
          .select('*');

        if (error) {
          console.error(`Error updating SKU ${skuId}:`, error);
          errors.push(`Failed to update SKU ${skuId}: ${error.message}`);
        } else if (data && data.length > 0) {
          const updatedEntry = data[0];
          updatedRows.push({
            skuId: updatedEntry.sku_id,
            namaBarang: updatedEntry.nama_barang,
            satuan: updatedEntry.satuan || 'Pcs',
            kategori: updatedEntry.kategori || 'General',
            status: updatedEntry.status || 'Active',
            entitas: updatedEntry.entitas,
            barcode: updatedEntry.barcode,
            unitCost: updatedEntry.unit_cost,
            leadTimeDays: updatedEntry.lead_time_days ?? 3,
            safetyStockDays: updatedEntry.safety_stock_days ?? 3,
          });
        }
      }
    }

    if (errors.length > 0) {
      return NextResponse.json({ errors, updated: updatedRows }, { status: 400 });
    }

    return NextResponse.json(updatedRows);
  } catch (error) {
    console.error('Error updating calculator settings:', error);
    return NextResponse.json(
      { error: 'Gagal memperbarui pengaturan kalkulator' },
      { status: 500 }
    );
  }
}
