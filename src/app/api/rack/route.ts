import { NextResponse } from 'next/server';
import { getStockDetail, getMasterMap, getRackLabels } from '@/lib/google-sheets';

export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const action = searchParams.get('action');
    const search = searchParams.get('search') || '';

    switch (action) {
      case 'detail':
        const detail = await getStockDetail(search);
        return NextResponse.json(detail);
      
      case 'master':
        const master = await getMasterMap();
        return NextResponse.json(master);

      case 'labels':
        const labels = await getRackLabels();
        return NextResponse.json(labels);
      
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