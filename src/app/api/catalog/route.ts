import { NextResponse } from 'next/server';
import { getCatalog } from '@/lib/db';
import { EntityFilter } from '@/lib/db';
import { auth } from '@/lib/auth';

export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  try {
    const session = await auth();

    // No explicit auth check for GET, as Operator role should have read-only access.
    // If unauthenticated, the client-side useSession hook will handle redirection.

    const { searchParams } = new URL(request.url);
    const entParam = searchParams.get('ent')?.toUpperCase();

    const entity: EntityFilter =
      entParam === 'BBB' || entParam === 'BBT' || entParam === 'ALL' ? entParam : 'ALL'; // Default to ALL if not specified or invalid

    const catalog = await getCatalog({ entity });

    // Return all catalog entries and let the client filter for activeFlag as needed.
    return NextResponse.json(catalog);
  } catch (error) {
    console.error('Catalog API error:', error);
    return NextResponse.json(
      { error: 'Failed to load catalog data', detail: error instanceof Error ? error.message : String(error) },
      { status: 500 }
    );
  }
}
