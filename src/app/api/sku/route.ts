import { NextResponse } from 'next/server';
import { getCatalog } from '@/lib/google-sheets';

export const dynamic = 'force-dynamic';

/**
 * GET /api/sku?action=names[&entitas=BBB|BBT]
 * Returns list of SKU names and IDs for fuzzy matching.
 * Optionally filtered by entity (BBB or BBT).
 *
 * GET /api/sku?action=list[&entitas=BBB|BBT]
 * Returns full catalog entries (including entity), optionally filtered.
 */
export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const action = searchParams.get('action');
    const entitas = searchParams.get('entitas')?.toUpperCase();

    const catalog = await getCatalog();
    const filtered = entitas
      ? catalog.filter(c => c.entitas.toUpperCase() === entitas)
      : catalog;

    if (action === 'names') {
      const skus = filtered.map(c => ({
        skuId: c.skuId,
        namaBarang: c.namaBarang,
        entitas: c.entitas,
        satuan: c.satuan,
      }));
      return NextResponse.json(skus);
    }

    if (action === 'list') {
      return NextResponse.json(filtered);
    }

    return NextResponse.json({ error: 'Invalid action' }, { status: 400 });
  } catch (error) {
    console.error('SKU API error:', error);
    return NextResponse.json(
      { error: 'Gagal memuat data SKU', detail: error instanceof Error ? error.message : String(error) },
      { status: 500 }
    );
  }
}