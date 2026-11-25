import { NextResponse } from 'next/server';
import { getFefoLots } from '@/lib/google-sheets';

export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const limit = parseInt(searchParams.get('limit') || '50', 10);
    const lots = await getFefoLots(limit);
    return NextResponse.json(lots);
  } catch (error) {
    console.error('FEFO API error:', error);
    return NextResponse.json({ error: 'Gagal memuat data FEFO' }, { status: 500 });
  }
}