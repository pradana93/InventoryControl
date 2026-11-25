import { NextResponse } from 'next/server';
import { getStockDetail, getMasterMap, getRackLabels, getWarehouse, EntityFilter } from '@/lib/google-sheets';

export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const action = searchParams.get('action');
    const search = searchParams.get('search') || '';
    const entParam = searchParams.get('ent')?.toUpperCase();
    const entity: EntityFilter = (entParam === 'BBB' || entParam === 'BBT' || entParam === 'ALL') ? entParam : 'BBB';

    switch (action) {
      case 'detail': {
        const detail = await getStockDetail(search, entity);
        return NextResponse.json(detail);
      }
      
      case 'master': {
        const master = await getMasterMap();
        // Filter racks by entity
        if (entity && entity !== 'ALL') {
          const warehouse = await getWarehouse();
          const entityRackIds = new Set(
            warehouse.filter(w => w.entitas === entity).map(w => w.rackId)
          );
          return NextResponse.json({
            ...master,
            racks: master.racks.filter(r => entityRackIds.has(r.rack)),
          });
        }
        return NextResponse.json(master);
      }

      case 'labels': {
        const [labels, warehouse] = await Promise.all([
          getRackLabels(),
          getWarehouse(),
        ]);

        // Filter by entity
        const entityWarehouse = entity && entity !== 'ALL'
          ? warehouse.filter(w => w.entitas === entity)
          : warehouse;
        const entityRackIds = new Set(entityWarehouse.map(w => w.rackId));
        const entityWarehouseMap = new Map(entityWarehouse.map(w => [w.rackId, w]));

        const filtered = labels
          .filter(l => entityRackIds.has(l.rackId))
          .map(l => ({
            ...l,
            entitas: entityWarehouseMap.get(l.rackId)?.entitas || '',
          }));

        return NextResponse.json(filtered);
      }

      default:
        return NextResponse.json({ error: 'Invalid action' }, { status: 400 });
    }
  } catch (error) {
    console.error('Rack API error:', error);
    return NextResponse.json(
      { error: 'Failed to fetch rack data' },
      { status: 500 }
    );
  }
}