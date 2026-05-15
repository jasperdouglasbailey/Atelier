'use server';

import { revalidatePath } from 'next/cache';
import { decideApproval } from '@/lib/data/approvals';
import { getCurrentAppUser } from '@/lib/data/app-users';
import { createClient } from '@/lib/supabase/server';
import { logAudit } from '@/lib/utils/audit';
import { getCurrentActor } from '@/lib/utils/actor';

async function assertOwnerOrPartner() {
  const user = await getCurrentAppUser();
  if (!user || (user.role !== 'owner' && user.role !== 'partner')) {
    return { error: 'Only owner or partner accounts can approve or reject inbox items.' };
  }
  return null;
}

export async function approveAction(id: string) {
  const authError = await assertOwnerOrPartner();
  if (authError) return authError;

  const result = await decideApproval(id, 'approved');
  if (!result) return { error: 'Failed to approve' };
  revalidatePath('/inbox');
  revalidatePath('/');
  return { ok: true, effectWarning: result.effectWarning ?? null };
}

export async function rejectAction(id: string, reason?: string) {
  const authError = await assertOwnerOrPartner();
  if (authError) return authError;

  const result = await decideApproval(id, 'rejected', reason);
  if (!result) return { error: 'Failed to reject' };
  revalidatePath('/inbox');
  revalidatePath('/');
  return { ok: true };
}

/**
 * Undo a rejection. Safe at any time because rejection has no external
 * side effects — `applyApprovalDecisionEffects` returns early on
 * decision !== 'approved' for every action_type. Used by both:
 *   1. Toast undo right after clicking Reject (8s window in UI)
 *   2. "Restore to pending" button on rejected approvals in the Rejected tab
 *
 * Refuses if the approval was approved (that may have fired side effects)
 * or is already pending. To "undo" an approval, a separate action would
 * be needed since the email/effect may have already shipped.
 */
export async function undoRejectApprovalAction(id: string): Promise<{ ok: true } | { ok: false; error: string }> {
  const authError = await assertOwnerOrPartner();
  if (authError) return { ok: false, error: authError.error };

  const supabase = await createClient();

  // Verify current state. Only un-reject rejected rows.
  const { data: existing, error: readErr } = await supabase
    .from('atelier_approvals')
    .select('id, status, summary, action_type')
    .eq('id', id)
    .single();

  if (readErr || !existing) return { ok: false, error: 'Approval not found' };
  if (existing.status === 'pending') return { ok: false, error: 'Approval is already pending' };
  if (existing.status === 'approved') {
    return { ok: false, error: 'Cannot undo an approval — the side effects may have already fired. Create a new approval instead.' };
  }

  const { error } = await supabase
    .from('atelier_approvals')
    .update({
      status: 'pending',
      decided_at: null,
      decided_by: null,
      rejection_reason: null,
    })
    .eq('id', id);

  if (error) return { ok: false, error: error.message };

  await logAudit({
    userId: await getCurrentActor(),
    action: 'approval_reject_undone',
    tableName: 'atelier_approvals',
    recordId: id,
    newValue: { summary: existing.summary, action_type: existing.action_type },
  }).catch(() => {});

  revalidatePath('/inbox');
  revalidatePath('/');
  return { ok: true };
}

export async function approveAllHoldsAction(
  bookingId: string,
): Promise<{ approved: number; failed: number } | { error: string }> {
  const authError = await assertOwnerOrPartner();
  if (authError) return authError;

  const supabase = await createClient();
  const { data: pending, error: fetchErr } = await supabase
    .from('atelier_approvals')
    .select('id')
    .eq('booking_id', bookingId)
    .eq('action_type', 'crew_hold_request')
    .eq('status', 'pending');

  if (fetchErr) return { error: fetchErr.message };

  let approved = 0;
  let failed = 0;
  for (const row of pending ?? []) {
    const result = await decideApproval(row.id, 'approved');
    if (result) approved++;
    else failed++;
  }

  revalidatePath(`/bookings/${bookingId}`);
  revalidatePath('/inbox');
  revalidatePath('/');
  return { approved, failed };
}
