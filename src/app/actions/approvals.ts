'use server';

import { revalidatePath } from 'next/cache';
import { decideApproval } from '@/lib/data/approvals';

export async function approveAction(id: string) {
  const result = await decideApproval(id, 'approved');
  if (!result) return { error: 'Failed to approve' };
  revalidatePath('/inbox');
  revalidatePath('/');
  return { ok: true };
}

export async function rejectAction(id: string, reason?: string) {
  const result = await decideApproval(id, 'rejected', reason);
  if (!result) return { error: 'Failed to reject' };
  revalidatePath('/inbox');
  revalidatePath('/');
  return { ok: true };
}
