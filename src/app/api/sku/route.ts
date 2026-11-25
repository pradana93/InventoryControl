import { NextResponse } from 'next/server';
import { getCatalog } from '@/lib/google-sheets';

export const dynamic = 'force-dynamic';

/**
 * GET /api/sku?action=names
 * Returns list of SKU names and IDs for fuzzy matching
 */
export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const action = searchParams.get('action');
    
    if (action === 'names') {
      const catalog = await getCatalog();
      const skus = catalog.map(c => ({
        skuId: c.skuId,
        namaBarang: c.namaBarang,
      }));
      return NextResponse.json(skus);
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