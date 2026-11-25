import { NextRequest, NextResponse } from 'next/server';
import type { EntityFilter } from '@/lib/google-sheets';

export async function GET(request: NextRequest) {
  const stream = new TransformStream();
  const writer = stream.writable.getWriter();
  const encoder = new TextEncoder();

  const { searchParams } = new URL(request.url);
  const entParam = searchParams.get('ent')?.toUpperCase();
  const entity: EntityFilter = (entParam === 'BBB' || entParam === 'BBT' || entParam === 'ALL') ? entParam : 'BBB';

  const getDashboardData = async () => {
    const { getFullDashboard } = await import('@/lib/google-sheets');
    return await getFullDashboard(entity);
  };

  const send = async (data: unknown) => {
    await writer.write(encoder.encode(`data: ${JSON.stringify(data)}\n\n`));
  };

  const initial = await getDashboardData();
  send(initial);

  const interval = setInterval(async () => {
    try {
      const data = await getDashboardData();
      send(data);
    } catch (e) {
      console.error('SSE Error:', e);
    }
  }, 30000);

  // Clean up on disconnect
  request.signal.onabort = () => {
    clearInterval(interval);
    writer.close();
  };

  return new Response(stream.readable, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
    },
  });
}