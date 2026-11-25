import { NextResponse } from 'next/server';
import { getWarehouseHealth } from '@/lib/google-sheets';

export async function GET() {
  try {
    const health = await getWarehouseHealth();
    return NextResponse.json(health);
  } catch (err) {
    console.error('Health API error:', err);
    return NextResponse.json({ error: 'Failed to fetch warehouse health' }, { status: 500 });
  }
}