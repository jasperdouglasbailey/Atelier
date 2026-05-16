'use server';

import { revalidatePath } from 'next/cache';
import { proposeHoldRequests } from '@/lib/automation/hold-requests';
import { checkKillSwitch } from '@/lib/utils/kill-switch';
import { getCurrentAppUser } from '@/lib/data/app-users';
import { logAudit } from '@/lib/utils/audit';
import { getCurrentActor } from '@/lib/utils/actor';

export async function proposeHoldRequestsAction(bookingId: string) {
  // Owner/partner only. Writes approval-queue rows + can fan out into
  // outbound emails downstream — portal users (talent/crew) must never
  // be able to trigger it via the action endpoint.
  const appUser = await getCurrentAppUser();
  if (!appUser || (appUser.role !== 'owner' && appUser.role !== 'partner')) {
    return { error: 'Forbidden — owner or partner role required.' };
  }

  const ks = await checkKillSwitch();
  if (!ks.canProceed) {
    return { error: 'Kill switch is active — no new drafts.' };
  }

  const result = await proposeHoldRequests(bookingId);

  await logAudit({
    userId: await getCurrentActor(),
    action: 'propose_hold_requests',
    tableName: 'atelier_approvals',
    recordId: bookingId,
    newValue: { bookingId, summary: result } as never,
  }).catch(() => { /* non-fatal — audit failure shouldn't block the workflow */ });

  revalidatePath(`/bookings/${bookingId}`);
  revalidatePath('/inbox');
  return result;
}
