import { createClient } from '@/lib/supabase/server';
import type { Approval, ApprovalStatus } from '@/lib/types/database';
import { logAudit } from '@/lib/utils/audit';
import { emitEvent } from '@/lib/utils/events';
import { applyApprovalDecisionEffects } from '@/lib/automation/approval-effects';

const TABLE = 'atelier_approvals';

export async function listApprovals(status?: ApprovalStatus): Promise<Approval[]> {
  const supabase = await createClient();
  let query = supabase
    .from(TABLE)
    .select('*')
    .order('created_at', { ascending: false })
    .limit(50);

  if (status) query = query.eq('status', status);

  const { data, error } = await query;
  if (error) { console.error('[approvals] list', error.message); return []; }
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
): Promise<Approval | null> {
  const supabase = await createClient();

  const { data, error } = await supabase
    .from(TABLE)
    .update({
      status: decision,
      decided_at: new Date().toISOString(),
      decided_by: 'jasper',
      rejection_reason: decision === 'rejected' ? (rejectionReason ?? null) : null,
    })
    .eq('id', id)
    .select()
    .single();

  if (error) { console.error('[approvals] decide', error.message); return null; }

  const approval = data as Approval;

  await emitEvent(`approval.${decision}`, {
    approval_id: id,
    action_type: approval.action_type,
    agent: approval.agent,
  }, { bookingId: approval.booking_id, actor: 'jasper' });

  await logAudit({
    userId: 'jasper',
    action: `approval_${decision}`,
    tableName: TABLE,
    recordId: id,
    newValue: { decision, rejectionReason: rejectionReason ?? null },
  });

  // Dispatch downstream side effects (e.g. flip atelier_booking_crew.status
  // from hold_requested → sent on a crew_hold_request approval). Failures
  // are logged but don't roll back the decision row itself.
  try {
    await applyApprovalDecisionEffects(approval, decision);
  } catch (err) {
    console.error('[approvals] decision effects failed', err);
  }

  return approval;
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
}): Promise<Approval | null> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from(TABLE)
    .insert({
      ...input,
      status: 'pending' as ApprovalStatus,
    })
    .select()
    .single();

  if (error) { console.error('[approvals] create', error.message); return null; }
  return data as Approval;
}
