import { NextResponse } from 'next/server';
import { getRackDetail } from '@/lib/google-sheets';

export const dynamic = 'force-dynamic';

export async function GET(
  request: Request,
  { params }: { params: Promise<{ rackId: string }> }
) {
  try {
    const { rackId } = await params;
    const decodedRackId = decodeURIComponent(rackId);
    
    const detail = await getRackDetail(decodedRackId);
    
    if (!detail) {
      return NextResponse.json(
        { error: `Rak "${decodedRackId}" tidak ditemukan` },
        { status: 404 }
      );
    }

    return NextResponse.json(detail);
  } catch (error) {
    console.error('Rack scan API error:', error);
    return NextResponse.json(
      { error: 'Gagal memuat data rak' },
      { status: 500 }
    );
  }
}