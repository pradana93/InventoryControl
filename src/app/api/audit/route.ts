import { NextResponse } from 'next/server';
import { getAuditLogs, AuditLogEntry } from '@/lib/audit';

export const dynamic = 'force-dynamic';

// ============================================================================
// AUDIT LOG API
// ============================================================================
// Read-only endpoint for the /audit compliance viewer. Returns the immutable
// audit trail (newest first) with optional filters. The `ent` query param is
// accepted for consistency with the rest of the app, but audit logs are not
// entity-scoped, so it is only echoed back in the response for the client.
// ============================================================================

/** Accepted entity values — kept in sync with useEntity / db.ts. */
const VALID_ENTITIES = ['BBB', 'BBT', 'ALL'] as const;

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);

    const entParam = searchParams.get('ent')?.toUpperCase();
    const ent = VALID_ENTITIES.includes(entParam as any) ? entParam : 'ALL';

    const tableName = searchParams.get('tableName') || searchParams.get('entity') || undefined;
    const action = searchParams.get('action') || undefined;
    const recordId = searchParams.get('recordId') || undefined;
    const limitParam = searchParams.get('limit');
    const limit = limitParam ? Number(limitParam) : undefined;

    // Read the audit trail. getAuditLogs validates the action filter and clamps
    // the limit, so invalid input fails with a clear 500-style error rather
    // than silently returning wrong data.
    let logs: AuditLogEntry[] = await getAuditLogs({
      tableName: tableName || undefined,
      action: action || undefined,
      limit: Number.isFinite(limit as number) ? (limit as number) : undefined,
    });

    // recordId is not part of getAuditLogs' server-side filter, so apply it
    // here (case-insensitive partial match keeps the UI search forgiving).
    if (recordId) {
      const needle = recordId.toLowerCase();
      logs = logs.filter((l) => (l.recordId || '').toLowerCase().includes(needle));
    }

    return NextResponse.json({ logs, ent });
  } catch (error) {
    console.error('Audit API error:', error);
    return NextResponse.json(
      {
        error: 'Gagal memuat audit log',
        detail: error instanceof Error ? error.message : String(error),
      },
      { status: 500 }
    );
  }
}
