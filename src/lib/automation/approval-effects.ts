/**
 * Side effects that run after Jasper approves or rejects a queued draft.
 *
 * Approval-queue rows track the *decision*; the actual state change in the
 * underlying booking/crew/etc. lives in their own tables. This dispatcher
 * keeps that translation in one place — every action_type maps to a
 * concrete update keyed off the approval's draft_content payload.
 *
 * Add a new branch when you add a new action_type. Default = no-op.
 */

import type { Approval } from '@/lib/types/database';
import { updateBookingCrewStatusByCrewId } from '@/lib/data/quotes';
import { logAudit } from '@/lib/utils/audit';
import { emitEvent } from '@/lib/utils/events';
import { getCurrentActor } from '@/lib/utils/actor';

export type Decision = 'approved' | 'rejected';

export async function applyApprovalDecisionEffects(approval: Approval, decision: Decision): Promise<void> {
  switch (approval.action_type) {
    case 'crew_hold_request':
      await applyCrewHoldRequestEffect(approval, decision);
      return;
    default:
      // Unknown action_type — no side effects yet. Logged for visibility.
      console.info('[approval-effects] no handler for', approval.action_type);
      return;
  }
}

async function applyCrewHoldRequestEffect(approval: Approval, decision: Decision) {
  if (decision !== 'approved') return; // rejection leaves crew row as-is

  const draft = approval.draft_content as { crew_id?: string } | null;
  const crewId = draft?.crew_id;
  const bookingId = approval.booking_id;

  if (!crewId || !bookingId) {
    console.warn('[approval-effects] hold-request approved but missing crew_id or booking_id');
    return;
  }

  const updated = await updateBookingCrewStatusByCrewId(bookingId, crewId, 'sent');
  if (!updated) return;

  await emitEvent('crew.hold_request_sent', {
    booking_id: bookingId,
    crew_id: crewId,
    approval_id: approval.id,
  }, { bookingId, actor: await getCurrentActor() });

  await logAudit({
    userId: await getCurrentActor(),
    action: 'crew_status_change',
    tableName: 'atelier_booking_crew',
    recordId: `${bookingId}:${crewId}`,
    oldValue: { status: 'hold_requested' },
    newValue: { status: 'sent', via: 'approval', approval_id: approval.id },
  });
}
