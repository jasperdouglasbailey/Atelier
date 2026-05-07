/**
 * Cron: Data retention sweep.
 *
 * Runs daily at 03:30 UTC. Three independent jobs in one cron to keep the
 * Vercel cron count low:
 *
 *   1. EXPIRE STALE APPROVAL DRAFTS — pending approvals older than 30 days
 *      are marked `expired`. The row stays so the audit trail shows the
 *      draft existed but didn't go out.
 *
 *   2. HARD-DELETE OLD APPROVALS — any approval row (any status) older than
 *      180 days is hard-deleted. The atelier_audit_log row that wrote the
 *      approval is the durable record from this point on.
 *
 *   3. PURGE OLD LLM CALLS — atelier_llm_calls rows older than 90 days are
 *      deleted. Those rows can contain prompt fragments which include
 *      client brief content; not keeping them past 90 days reduces our
 *      PII footprint without harming day-to-day debugging.
 *
 * Protected by CRON_SECRET_DATA_RETENTION (or CRON_SECRET as a fallback for
 * backwards compat — every other cron also accepts the shared secret while
 * the agency rolls per-cron secrets out gradually).
 */

import { NextResponse, type NextRequest } from 'next/server';
import { createServiceClient } from '@/lib/supabase/service';
import { logAudit } from '@/lib/utils/audit';
import { isCronAuthorised } from '@/lib/utils/cron-auth';

const APPROVAL_EXPIRE_DAYS = 30;
const APPROVAL_HARD_DELETE_DAYS = 180;
const LLM_CALLS_RETENTION_DAYS = 90;

function isoDaysAgo(days: number): string {
  return new Date(Date.now() - days * 86_400_000).toISOString();
}

export async function GET(req: NextRequest) {
  if (!isCronAuthorised(req, 'DATA_RETENTION')) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const supabase = createServiceClient();
  const result: Record<string, number | string> = {};

  // ---- 1. Expire stale pending approvals ------------------------------
  {
    const cutoff = isoDaysAgo(APPROVAL_EXPIRE_DAYS);
    const { data, error } = await supabase
      .from('atelier_approvals')
      .update({ status: 'expired' })
      .eq('status', 'pending')
      .lt('created_at', cutoff)
      .select('id');
    if (error) {
      console.error('[cron/data-retention] expire approvals failed', error.message);
      result.approvalsExpiredError = error.message;
    } else {
      result.approvalsExpired = data?.length ?? 0;
    }
  }

  // ---- 2. Hard-delete very-old approvals ------------------------------
  {
    const cutoff = isoDaysAgo(APPROVAL_HARD_DELETE_DAYS);
    const { data, error } = await supabase
      .from('atelier_approvals')
      .delete()
      .lt('created_at', cutoff)
      .select('id');
    if (error) {
      console.error('[cron/data-retention] hard-delete approvals failed', error.message);
      result.approvalsDeletedError = error.message;
    } else {
      result.approvalsDeleted = data?.length ?? 0;
    }
  }

  // ---- 3. Purge old atelier_llm_calls ---------------------------------
  {
    const cutoff = isoDaysAgo(LLM_CALLS_RETENTION_DAYS);
    const { data, error } = await supabase
      .from('atelier_llm_calls')
      .delete()
      .lt('created_at', cutoff)
      .select('id');
    if (error) {
      console.error('[cron/data-retention] purge llm_calls failed', error.message);
      result.llmCallsPurgedError = error.message;
    } else {
      result.llmCallsPurged = data?.length ?? 0;
    }
  }

  // Audit-log the run so we have evidence the sweep happened
  await logAudit({
    userId: 'cron',
    action: 'cron_data_retention',
    tableName: 'atelier_approvals',
    recordId: null,
    newValue: result as never,
  }).catch((err) => console.error('[cron/data-retention] audit log failed', err));

  return NextResponse.json(result);
}
