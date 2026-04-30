'use server';

import { revalidatePath } from 'next/cache';
import { proposeHoldRequests } from '@/lib/automation/hold-requests';
import { checkKillSwitch } from '@/lib/utils/kill-switch';

export async function proposeHoldRequestsAction(bookingId: string) {
  const ks = await checkKillSwitch();
  if (!ks.canProceed) {
    return { error: 'Kill switch is active — no new drafts.' };
  }

  const result = await proposeHoldRequests(bookingId);
  revalidatePath(`/bookings/${bookingId}`);
  revalidatePath('/inbox');
  return result;
}
