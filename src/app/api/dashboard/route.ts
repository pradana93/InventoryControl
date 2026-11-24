import { NextResponse } from 'next/server';
import { getFullDashboard } from '@/lib/google-sheets';

export async function GET() {
  try {
    const data = await getFullDashboard();
    return NextResponse.json(data);
  } catch (error) {
    console.error('Dashboard API error:', error);
    return NextResponse.json(
      { error: 'Failed to fetch dashboard data' },
      { status: 500 }
    );
  }
}