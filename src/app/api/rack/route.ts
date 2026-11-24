import { NextResponse } from 'next/server';
import { getStockDetail, getMasterMap } from '@/lib/google-sheets';

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