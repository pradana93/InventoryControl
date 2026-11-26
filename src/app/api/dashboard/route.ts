import { NextResponse } from 'next/server';
import { getFullDashboard, getCalculatorSummary, EntityFilter } from '@/lib/google-sheets';

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const ent = searchParams.get('ent')?.toUpperCase() as EntityFilter | null;
    
    const validEntity: EntityFilter = (ent === 'BBB' || ent === 'BBT' || ent === 'ALL') ? ent : 'BBB';
    
    const [dashboardData, calculatorSummary] = await Promise.all([
      getFullDashboard(validEntity),
      getCalculatorSummary(validEntity),
    ]);

    return NextResponse.json({
      ...dashboardData,
      calculatorSummary,
    });
  } catch (error) {
    console.error('Dashboard API error:', error);
    return NextResponse.json(
      { error: 'Failed to fetch dashboard data' },
      { status: 500 }
    );
  }
}