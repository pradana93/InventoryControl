import { NextResponse } from 'next/server';
import {
  getInventoryLots,
  getCatalog,
  getLedger,
  EntityFilter,
} from '@/lib/db';
import { filterActiveSkus } from '@/lib/warehouse-optimization';
import { computeAnalytics } from '@/lib/analytics';

export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const entParam = searchParams.get('ent')?.toUpperCase();
    const validEntities = ['BBB', 'BBT', 'ALL'] as const;
    const entity: EntityFilter = validEntities.includes(entParam as any)
      ? (entParam as EntityFilter)
      : 'BBB';

    const [lots, catalog, ledger] = await Promise.all([
      getInventoryLots(),
      getCatalog(),
      getLedger(),
    ]);

    const filteredCatalog = filterActiveSkus(
      catalog.filter((item) => entity === 'ALL' || item.entitas === entity)
    );
    const activeSkuNames = new Set(
      filteredCatalog.map((c) => c.namaBarang.toLowerCase())
    );
    const filteredLots =
      entity === 'ALL' ? lots : lots.filter((lot) => lot.entitas === entity);
    const activeLots = filteredLots.filter((lot) =>
      activeSkuNames.has(lot.namaBarang.toLowerCase())
    );
    const filteredLedger =
      entity === 'ALL' ? ledger : ledger.filter((e) => e.entitas === entity);

    const result = computeAnalytics(activeLots, filteredCatalog, filteredLedger);
    return NextResponse.json(result);
  } catch (error) {
    console.error('Analytics API error:', error);
    return NextResponse.json(
      { error: 'Gagal menghitung analisis lanjutan' },
      { status: 500 }
    );
  }
}
