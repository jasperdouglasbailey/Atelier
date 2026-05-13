import { createClient } from '@/lib/supabase/server';
import { reportDataError } from '@/lib/utils/data-errors';
import { QUERY_LIMITS } from '@/lib/utils/constants';
import type { Approval, ApprovalStatus } from '@/lib/types/database';
import { logAudit } from '@/lib/utils/audit';
import { emitEvent } from '@/lib/utils/events';
import { applyApprovalDecisionEffects } from '@/lib/automation/approval-effects';
import { getCurrentActor } from '@/lib/utils/actor';

const TABLE = 'atelier_approvals';

export async function listApprovals(status?: ApprovalStatus): Promise<Approval[]> {
  const supabase = await createClient();
  let query = supabase
    .from(TABLE)
    .select('*')
    .order('created_at', { ascending: false })
    .limit(QUERY_LIMITS.approvals_inbox);

  if (status) query = query.eq('status', status);

  const { data, error } = await query;
  if (error) { reportDataError('[approvals] list', error); return []; }
  return (data ?? []) as Approval[];
}

export async function getPendingCount(): Promise<number> {
  const supabase = await createClient();
  const { count, error } = await supabase
    .from(TABLE)
    .select('*', { count: 'exact', head: true })
    .eq('status', 'pending');

  if (error) return 0;
  return count ?? 0;
}

export async function decideApproval(
  id: string,
  decision: 'approved' | 'rejected',
  rejectionReason?: string,
): Promise<(Approval & { effectWarning: string | null }) | null> {
  const supabase = await createClient();

  const { data, error } = await supabase
    .from(TABLE)
    .update({
      status: decision,
      decided_at: new Date().toISOString(),
      decided_by: await getCurrentActor(),
      rejection_reason: decision === 'rejected' ? (rejectionReason ?? null) : null,
    })
    .eq('id', id)
    .select()
    .single();

  if (error) { reportDataError('[approvals] decide', error); return null; }

  const approval = data as Approval;

  await emitEvent(`approval.${decision}`, {
    approval_id: id,
    action_type: approval.action_type,
    agent: approval.agent,
  }, { bookingId: approval.booking_id, actor: await getCurrentActor() });

  await logAudit({
    userId: await getCurrentActor(),
    action: `approval_${decision}`,
    tableName: TABLE,
    recordId: id,
    newValue: { decision, rejectionReason: rejectionReason ?? null },
  });

  // Dispatch downstream side effects. Failures are logged but don't roll
  // back the decision row — the approval stands, but we surface the error
  // so the UI can warn the user (e.g. "Google not connected").
  let effectWarning: string | null = null;
  try {
    await applyApprovalDecisionEffects(approval, decision);
  } catch (err) {
    effectWarning = err instanceof Error ? err.message : 'Effect failed';
    reportDataError('[approvals] decision effects failed', err);
  }

  return { ...approval, effectWarning };
}

export async function createApproval(input: {
  agent: Approval['agent'];
  action_type: string;
  booking_id?: string | null;
  summary: string;
  draft_content: Record<string, unknown>;
  confidence?: number;
  uncertainty_sources?: string[];
  precedent_refs?: string[];
  /**
   * Idempotency key — pass directly so the row is inserted with it in
   * one round trip. Two concurrent calls with the same key will collide
   * on the unique constraint and the loser gets `duplicate=true`. This
   * eliminates the TOCTOU race the previous "check-then-update" pattern
   * had.
   */
  idempotency_key?: string;
}): Promise<{ approval: Approval | null; duplicate: boolean }> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from(TABLE)
    .insert({
      ...input,
      status: 'pending' as ApprovalStatus,
    })
    .select()
    .single();

  if (error) {
    // 23505 = unique_violation on idempotency_key — this is the "row
    // already queued" case, not an error.
    if (error.code === '23505') return { approval: null, duplicate: true };
    reportDataError('[approvals] create', error);
    return { approval: null, duplicate: false };
  }
  return { approval: data as Approval, duplicate: false };
}
