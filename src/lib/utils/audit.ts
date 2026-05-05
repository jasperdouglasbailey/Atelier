import { createClient } from '@/lib/supabase/server';
import type { Json, AuditLogRow } from '@/lib/types/database';

const TABLE = 'atelier_audit_log';

export type AuditEntry = {
  userId: string | null;
  action: string;
  tableName: string;
  recordId?: string | null;
  oldValue?: Json | null;
  newValue?: Json | null;
  ipAddress?: string | null;
};

export async function logAudit(entry: AuditEntry): Promise<void> {
  try {
    const supabase = await createClient();
    const { error } = await supabase.from(TABLE).insert({
      user_id: entry.userId,
      action: entry.action,
      table_name: entry.tableName,
      record_id: entry.recordId ?? null,
      old_value: entry.oldValue ?? null,
      new_value: entry.newValue ?? null,
      ip_address: entry.ipAddress ?? null,
    });
    if (error) console.error('[audit] insert failed', error.message);
  } catch (err) {
    console.error('[audit] threw', err);
  }
}

/**
 * Audit-log a failed mutation or tool call. Same row shape as logAudit but
 * the action is suffixed with `_failed`, the recordId is optional, and the
 * `new_value` carries the input payload + error message so we can replay or
 * triage. Use this from server actions and integrations that fail
 * gracefully — without it, those failures vanish into Vercel logs and
 * never surface in the in-app /audit view.
 */
export async function logAuditFailure(input: {
  userId: string | null;
  /** What you were trying to do, e.g. 'update_booking', 'send_email'. */
  action: string;
  /** Target table or integration name (e.g. 'gmail', 'xero'). */
  tableName: string;
  recordId?: string | null;
  /** What was attempted (FormData snapshot, payload, etc.). */
  attempted?: Json | null;
  /** Error message — pass error.message or stringified error. */
  error: string;
}): Promise<void> {
  await logAudit({
    userId: input.userId,
    action: `${input.action}_failed`,
    tableName: input.tableName,
    recordId: input.recordId ?? null,
    newValue: ({
      attempted: input.attempted ?? null,
      error: input.error,
    } as unknown) as Json,
  });
}

export type AuditFilters = {
  fromDate?: string;
  toDate?: string;
  action?: string;
  tableName?: string;
  page?: number;
  pageSize?: number;
};

export async function listAudit(filters: AuditFilters = {}): Promise<{
  rows: AuditLogRow[];
  total: number;
  page: number;
  pageSize: number;
}> {
  const page = filters.page ?? 1;
  const pageSize = filters.pageSize ?? 25;
  const from = (page - 1) * pageSize;
  const to = from + pageSize - 1;

  const supabase = await createClient();
  let query = supabase
    .from(TABLE)
    .select('*', { count: 'exact' })
    .order('created_at', { ascending: false })
    .range(from, to);

  if (filters.fromDate) query = query.gte('created_at', filters.fromDate);
  if (filters.toDate) query = query.lte('created_at', filters.toDate);
  if (filters.action) query = query.eq('action', filters.action);
  if (filters.tableName) query = query.eq('table_name', filters.tableName);

  const { data, count, error } = await query;
  if (error) {
    console.error('[audit] list failed', error.message);
    return { rows: [], total: 0, page, pageSize };
  }
  return {
    rows: (data ?? []) as AuditLogRow[],
    total: count ?? 0,
    page,
    pageSize,
  };
}
