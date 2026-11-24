import { NextResponse } from 'next/server';
import { getSKUNames, getStockBySku, getRackDetailsBySKU } from '@/lib/google-sheets';

export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const action = searchParams.get('action');
    const search = searchParams.get('search') || '';
    const skuName = searchParams.get('skuName') || '';

    switch (action) {
      case 'names':
        const names = await getSKUNames();
        return NextResponse.json(names);
      
      case 'stock':
        const stock = await getStockBySku(search);
        return NextResponse.json(stock);
      
      case 'rack-details':
        if (!skuName) {
          return NextResponse.json({ error: 'skuName required' }, { status: 400 });
        }
        const racks = await getRackDetailsBySKU(skuName);
        return NextResponse.json(racks);
      
      default:
        return NextResponse.json({ error: 'Invalid action' }, { status: 400 });
    }
  } catch (error) {
    console.error('SKU API error:', error);
    return NextResponse.json(
      { error: 'Failed to fetch SKU data' },
      { status: 500 }
    );
  }
}