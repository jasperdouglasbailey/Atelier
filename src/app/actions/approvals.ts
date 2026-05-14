'use server';

import { revalidatePath } from 'next/cache';
import { decideApproval } from '@/lib/data/approvals';
import { getCurrentAppUser } from '@/lib/data/app-users';
import { createClient } from '@/lib/supabase/server';

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
