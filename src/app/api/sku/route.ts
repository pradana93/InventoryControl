import { NextResponse } from 'next/server';
import { getCatalog, getStockDetail, EntityFilter } from '@/lib/google-sheets';

export const dynamic = 'force-dynamic';

/**
 * GET /api/sku?action=names[&entitas=BBB|BBT|&ent=BBB|BBT]
 * Returns list of SKU names and IDs for fuzzy matching.
 * Optionally filtered by entity (BBB or BBT).
 *
 * GET /api/sku?action=list[&entitas=BBB|BBT]
 * Returns full catalog entries (including entity), optionally filtered.
 *
 * GET /api/sku?action=stock[&ent=BBB|BBT|ALL]
 * Returns per-SKU stock rows for the dashboard tables.
 *
 * GET /api/sku?action=rack-details&skuName=...&ent=BBB
 * Returns rack allocations for a given SKU within the entity.
 */
export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const action = searchParams.get('action');
    const entParam = searchParams.get('ent')?.toUpperCase();
    const entitas = (searchParams.get('entitas')?.toUpperCase()) || (entParam !== 'ALL' ? entParam : undefined);

    const entity: EntityFilter =
      entParam === 'BBB' || entParam === 'BBT' || entParam === 'ALL' ? entParam : 'BBB';

    if (action === 'stock') {
      const details = await getStockDetail('', entity);
      return NextResponse.json(details);
    }

    if (action === 'rack-details') {
      const skuName = searchParams.get('skuName') || '';
      const details = await getStockDetail(skuName, entity);
      const racks = details
        .filter(d => d.namaBarang.toLowerCase() === skuName.toLowerCase())
        .map(d => ({
          rack: d.nomorRak,
          qtySistem: d.qtySistem,
          entitas: d.entitas,
        }));
      return NextResponse.json(racks);
    }

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
        activeFlag: c.activeFlag ?? true,
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
