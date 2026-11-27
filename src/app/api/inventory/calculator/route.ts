import { NextResponse } from 'next/server';
import { getInventoryLots, getCatalog, getLedger } from '@/lib/db';
import { calculateInventoryMetrics } from '@/lib/inventory-calculator';
import { filterActiveSkus } from '@/lib/warehouse-optimization';

export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const entParam = searchParams.get('ent')?.toUpperCase();
    const validEntities = ['BBB', 'BBT', 'ALL'] as const;
    const entity: 'BBB' | 'BBT' | 'ALL' = validEntities.includes(entParam as any) ? (entParam as 'BBB' | 'BBT' | 'ALL') : 'BBB';

    const [lots, catalog, ledger] = await Promise.all([
      getInventoryLots(),
      getCatalog(),
      getLedger(),
    ]);

    const results = calculateInventoryMetrics({
      lots,
      catalog,
      ledger,
      entity,
    });

    // Filter out inactive SKUs
    const filteredResults = filterActiveSkus(results);

    return NextResponse.json(filteredResults);
  } catch (error) {
    console.error('Inventory Calculator API error:', error);
    return NextResponse.json({ error: 'Gagal menghitung metrik inventori' }, { status: 500 });
  }
}