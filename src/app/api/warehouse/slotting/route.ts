import { NextResponse } from 'next/server';
import { getInventoryLots, getLedger, getCatalog, EntityFilter } from '@/lib/db';
import {
  computeAbcClassification,
  computeSlottingRecommendations,
  SkuLifecycleItem,
} from '@/lib/slotting';
import { auth } from '@/lib/auth';
import { filterActiveSkusByEntity } from '@/lib/warehouse-optimization';

export const dynamic = 'force-dynamic';

const VALID_ENTITIES = ['BBB', 'BBT', 'ALL'] as const;

export async function GET(request: Request) {
  try {
    const session = await auth();

    // Read-only for all authenticated roles (Operator can view the move list).
    if (!session?.user?.email) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    if (session.user.role !== 'super-admin' && session.user.role !== 'manager') {
      return NextResponse.json(
        { error: 'Forbidden: Super Admin or Manager role required' },
        { status: 403 }
      );
    }

    const { searchParams } = new URL(request.url);
    const entParam = searchParams.get('ent')?.toUpperCase();
    const entity: EntityFilter = VALID_ENTITIES.includes(entParam as any)
      ? (entParam as EntityFilter)
      : 'BBB';

    const [catalog, ledger, lots] = await Promise.all([
      getCatalog(),
      getLedger(),
      getInventoryLots(),
    ]);

    // Active SKUs only, scoped to the requested entity.
    const activeSkus: SkuLifecycleItem[] = filterActiveSkusByEntity(catalog, entity)
      .map((c) => ({
        skuId: c.skuId,
        namaBarang: c.namaBarang,
        entitas: c.entitas as 'BBB' | 'BBT',
        activeFlag: c.activeFlag ?? true,
        currentStock: 0,
        inventoryValue: 0,
        status: 'Aktif',
      }));

    const filteredLedger =
      entity === 'ALL' ? ledger : ledger.filter((e) => e.entitas === entity);
    const filteredLots = entity === 'ALL' ? lots : lots.filter((l) => l.entitas === entity);

    const classifications = computeAbcClassification(filteredLedger, 90);
    const recommendations = computeSlottingRecommendations(
      activeSkus,
      classifications,
      filteredLots,
      filteredLedger
    );

    return NextResponse.json(recommendations);
  } catch (error) {
    console.error('Slotting API error:', error);
    return NextResponse.json(
      { error: 'Gagal menghitung rekomendasi slotting' },
      { status: 500 }
    );
  }
}
