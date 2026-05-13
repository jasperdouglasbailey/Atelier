'use server';

import { revalidatePath } from 'next/cache';
import { decideApproval } from '@/lib/data/approvals';
import { getCurrentAppUser } from '@/lib/data/app-users';

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
