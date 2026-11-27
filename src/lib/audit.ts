import { supabaseAdmin } from './supabase';

// ============================================================================
// AUDIT LOG
// ============================================================================
// Immutable audit trail for data mutations. Every write to the database should
// record an entry here so changes can be traced back to a user and a point in
// time. The `audit_logs` table enforces this at the DB level via RLS:
//   - INSERT is allowed for authenticated users
//   - UPDATE / DELETE are restricted to super-admin / manager only
//
// The DB `action` column is constrained to the values below; we validate on the
// client too so callers get a clear error instead of a Postgres constraint
// violation.
// ============================================================================

/** Allowed audit actions — must match the CHECK constraint on audit_logs.action. */
export const AUDIT_ACTIONS = [
  'INSERT',
  'UPDATE',
  'DELETE',
  'OPNAME',
  'CONFIRM',
  'TOGGLE',
] as const;

export type AuditAction = (typeof AUDIT_ACTIONS)[number];

/** JSON-serializable snapshot of a record's values. */
export type AuditValues = Record<string, unknown> | null | undefined;

/** A single row in the audit_logs table. */
export interface AuditLogEntry {
  id: string;
  timestamp: string;
  userEmail: string;
  action: AuditAction;
  tableName: string;
  recordId: string | null;
  oldValues: Record<string, unknown> | null;
  newValues: Record<string, unknown> | null;
}

export interface LogAuditActionInput {
  /** Email (or id) of the user performing the action. Required. */
  userId: string;
  /** One of AUDIT_ACTIONS. Validated before writing. */
  action: AuditAction | string;
  /** Logical entity / table name being changed (e.g. 'catalog', 'ledger'). */
  entity: string;
  /** Identifier of the affected record, when applicable. */
  recordId?: string | null;
  /** Snapshot before the change. Null/undefined is stored as null (INSERT). */
  oldValues?: AuditValues;
  /** Snapshot after the change. Null/undefined is stored as null (DELETE). */
  newValues?: AuditValues;
}

export interface GetAuditLogsOptions {
  /** Filter by action (validated against AUDIT_ACTIONS). */
  action?: string;
  /** Filter by table_name. */
  tableName?: string;
  /** Alias for tableName — filter by table / entity name. */
  entity?: string;
  /** Max rows to return. Defaults to 100, capped at 1000. */
  limit?: number;
}

const MAX_LIMIT = 1000;
const DEFAULT_LIMIT = 100;

/**
 * Validate an action string against the allowed set.
 * Throws for unknown actions so a typo fails fast instead of corrupting data.
 */
export function isValidAuditAction(action: string): action is AuditAction {
  return (AUDIT_ACTIONS as readonly string[]).includes(action);
}

/** Normalize null/undefined snapshots to null so the column stays JSONB-clean. */
function normalizeValues(values: AuditValues): Record<string, unknown> | null {
  if (values === null || values === undefined) return null;
  return values as Record<string, unknown>;
}

/** Map a raw DB row to the camelCase AuditLogEntry shape. */
function mapRow(row: any): AuditLogEntry {
  return {
    id: String(row.id ?? ''),
    timestamp: row.timestamp ? new Date(row.timestamp).toISOString() : '',
    userEmail: String(row.user_email ?? ''),
    action: String(row.action ?? '') as AuditAction,
    tableName: String(row.table_name ?? ''),
    recordId: row.record_id === null || row.record_id === undefined ? null : String(row.record_id),
    oldValues: (row.old_values ?? null) as Record<string, unknown> | null,
    newValues: (row.new_values ?? null) as Record<string, unknown> | null,
  };
}

/**
 * Record an audit entry. Returns the generated log id.
 *
 * Edge cases:
 *   - unknown `action` throws before hitting the DB
 *   - missing `userId` throws
 *   - null/undefined oldValues/newValues are stored as SQL NULL
 */
export async function logAuditAction(input: LogAuditActionInput): Promise<string> {
  const { userId, action, entity, recordId, oldValues, newValues } = input;

  if (!userId || !String(userId).trim()) {
    throw new Error('[audit_logs] userId is required');
  }
  if (!entity || !String(entity).trim()) {
    throw new Error('[audit_logs] entity (table_name) is required');
  }
  if (!isValidAuditAction(String(action))) {
    throw new Error(
      `[audit_logs] invalid action "${action}". Expected one of: ${AUDIT_ACTIONS.join(', ')}`
    );
  }

  const { data, error } = await supabaseAdmin
    .from('audit_logs')
    .insert({
      user_email: String(userId).trim(),
      action,
      table_name: String(entity).trim(),
      record_id: recordId === null || recordId === undefined ? null : String(recordId),
      old_values: normalizeValues(oldValues),
      new_values: normalizeValues(newValues),
    })
    .select('id')
    .single();

  if (error) throw new Error(`[audit_logs] ${error.message}`);
  return String(data?.id ?? '');
}

/**
 * Read audit logs, newest first, with optional filters.
 *
 * Edge cases:
 *   - invalid `action` filter throws
 *   - `entity` is accepted as an alias for `tableName`
 *   - `limit` is clamped to [1, 1000]
 */
export async function getAuditLogs(options?: GetAuditLogsOptions): Promise<AuditLogEntry[]> {
  const tableName = options?.tableName ?? options?.entity;

  if (options?.action !== undefined && !isValidAuditAction(String(options.action))) {
    throw new Error(
      `[audit_logs] invalid action filter "${options.action}". Expected one of: ${AUDIT_ACTIONS.join(', ')}`
    );
  }

  const limit = Math.min(Math.max(options?.limit ?? DEFAULT_LIMIT, 1), MAX_LIMIT);

  let query = supabaseAdmin
    .from('audit_logs')
    .select('*')
    .order('timestamp', { ascending: false })
    .limit(limit);

  if (options?.action) query = query.eq('action', String(options.action));
  if (tableName) query = query.eq('table_name', String(tableName));

  const { data, error } = await query;
  if (error) throw new Error(`[audit_logs] ${error.message}`);

  return (data || []).map(mapRow);
}
