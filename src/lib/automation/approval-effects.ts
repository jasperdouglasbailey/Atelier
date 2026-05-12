/**
 * Side effects that run after Jasper approves or rejects a queued draft.
 *
 * Approval-queue rows track the *decision*; the actual state change in the
 * underlying booking/crew/etc. lives in their own tables. This dispatcher
 * keeps that translation in one place — every action_type maps to a
 * concrete update keyed off the approval's draft_content payload.
 *
 * Add a new branch when you add a new action_type. Default = no-op,
 * BUT prefer adding the handler explicitly — silent no-ops on approved
 * drafts cost real workflow time (we shipped two crons that produced
 * approvals nothing handled, and Jasper kept clicking approve with no
 * email going out).
 */

import type { Approval } from '@/lib/types/database';
import { updateBookingCrewStatusByCrewId } from '@/lib/data/quotes';
import { logAudit, logAuditFailure } from '@/lib/utils/audit';
import { emitEvent } from '@/lib/utils/events';
import { getCurrentActor } from '@/lib/utils/actor';
import { sendEmail } from '@/lib/integrations/gmail';
import { isGoogleConfigured } from '@/lib/integrations/google-auth';
import { checkKillSwitch } from '@/lib/utils/kill-switch';

export type Decision = 'approved' | 'rejected';

export async function applyApprovalDecisionEffects(approval: Approval, decision: Decision): Promise<void> {
  switch (approval.action_type) {
    case 'crew_hold_request':
      await applyCrewHoldRequestEffect(approval, decision);
      return;
    case 'client_chase_email':
      await applyClientChaseEmailEffect(approval, decision);
      return;
    case 'client_quote_chase_email':
      await applyClientQuoteChaseEmailEffect(approval, decision);
      return;
    case 'client_brief_clarify_email':
      await applyClientBriefClarifyEmailEffect(approval, decision);
      return;
    case 'compliance_renewal_ping':
      await applyComplianceRenewalPingEffect(approval, decision);
      return;
    case 'business_renewal_reminder':
      await applyBusinessRenewalReminderEffect(approval, decision);
      return;
    case 'talent_gallery_share_request':
      await applyTalentGalleryShareRequestEffect(approval, decision);
      return;
    case 'crew_gallery_share_request':
      await applyCrewGalleryShareRequestEffect(approval, decision);
      return;
    default:
      // Unknown action_type — no side effects yet. Logged for visibility.
      console.warn('[approval-effects] no handler for', approval.action_type);
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

// ============================================================
// Client chase email (post-shoot follow-up)
// ============================================================

type EmailDraftContent = {
  to: string[];
  subject: string;
  body: string;
};

function isEmailDraftContent(v: unknown): v is EmailDraftContent {
  if (!v || typeof v !== 'object') return false;
  const obj = v as Record<string, unknown>;
  return Array.isArray(obj.to) && typeof obj.subject === 'string' && typeof obj.body === 'string';
}

async function sendApprovedEmail(input: {
  approval: Approval;
  recipients: string[];
  subject: string;
  body: string;
  auditAction: string;
}): Promise<void> {
  // Doctrine: kill-switch RED or AMBER holds outbound. The approval already
  // cleared human review, but if the switch flipped between queue + approve
  // we respect that — keep the approval marked approved, but don't send.
  const { canSendOutbound, level } = await checkKillSwitch();
  if (!canSendOutbound) {
    await logAuditFailure({
      userId: await getCurrentActor(),
      action: input.auditAction,
      tableName: 'atelier_approvals',
      recordId: input.approval.id,
      error: 'kill_switch_active',
      attempted: { kill_switch_level: level },
    }).catch(() => {});
    return;
  }

  if (!isGoogleConfigured()) {
    // Dev / no-credentials path — sendEmail() returns a stub. We still
    // log so the timeline shows the handler ran.
    await logAudit({
      userId: await getCurrentActor(),
      action: input.auditAction,
      tableName: 'atelier_approvals',
      recordId: input.approval.id,
      newValue: { stub: true, recipients: input.recipients },
    });
    return;
  }

  try {
    const result = await sendEmail({
      to: input.recipients,
      subject: input.subject,
      body: input.body,
      bodyType: 'text',
      bookingRef: input.approval.booking_id ?? undefined,
    });

    await logAudit({
      userId: await getCurrentActor(),
      action: input.auditAction,
      tableName: 'atelier_approvals',
      recordId: input.approval.id,
      newValue: {
        message_id: result.messageId,
        recipients: input.recipients,
        sent_at: result.sentAt,
      },
    });
  } catch (err) {
    await logAuditFailure({
      userId: await getCurrentActor(),
      action: input.auditAction,
      tableName: 'atelier_approvals',
      recordId: input.approval.id,
      error: err instanceof Error ? err.message : 'send_failed',
    }).catch(() => {});
    // Re-throw so the calling action can surface the failure to the UI —
    // approving a draft and silently dropping the send is exactly the bug
    // this whole module was rewritten to prevent.
    throw err;
  }
}

async function applyClientChaseEmailEffect(approval: Approval, decision: Decision) {
  if (decision !== 'approved') return;

  const draft = approval.draft_content;
  if (!isEmailDraftContent(draft)) {
    console.warn('[approval-effects] client_chase_email missing/invalid draft_content');
    return;
  }
  if (draft.to.length === 0) {
    // Pre-PR-30 chase rows were queued without the recipient. Surface
    // rather than silently no-op.
    await logAuditFailure({
      userId: await getCurrentActor(),
      action: 'client_chase_email_send',
      tableName: 'atelier_approvals',
      recordId: approval.id,
      error: 'recipient_missing',
      attempted: { hint: 'Re-queue the chase via cron — old rows have empty `to`.' },
    }).catch(() => {});
    return;
  }

  await sendApprovedEmail({
    approval,
    recipients: draft.to,
    subject: draft.subject,
    body: draft.body,
    auditAction: 'client_chase_email_send',
  });
}

async function applyClientQuoteChaseEmailEffect(approval: Approval, decision: Decision) {
  if (decision !== 'approved') return;

  const draft = approval.draft_content;
  if (!isEmailDraftContent(draft)) {
    console.warn('[approval-effects] client_quote_chase_email missing/invalid draft_content');
    return;
  }
  if (draft.to.length === 0) {
    await logAuditFailure({
      userId: await getCurrentActor(),
      action: 'client_quote_chase_email_send',
      tableName: 'atelier_approvals',
      recordId: approval.id,
      error: 'recipient_missing',
    }).catch(() => {});
    return;
  }

  await sendApprovedEmail({
    approval,
    recipients: draft.to,
    subject: draft.subject,
    body: draft.body,
    auditAction: 'client_quote_chase_email_send',
  });
}

async function applyBusinessRenewalReminderEffect(approval: Approval, decision: Decision) {
  if (decision !== 'approved') return;

  const draft = approval.draft_content;
  if (!isEmailDraftContent(draft)) {
    console.warn('[approval-effects] business_renewal_reminder missing/invalid draft_content');
    return;
  }
  if (draft.to.length === 0) {
    await logAuditFailure({
      userId: await getCurrentActor(),
      action: 'business_renewal_reminder_send',
      tableName: 'atelier_approvals',
      recordId: approval.id,
      error: 'recipient_missing',
    }).catch(() => {});
    return;
  }

  await sendApprovedEmail({
    approval,
    recipients: draft.to,
    subject: draft.subject,
    body: draft.body,
    auditAction: 'business_renewal_reminder_send',
  });
}

async function applyClientBriefClarifyEmailEffect(approval: Approval, decision: Decision) {
  if (decision !== 'approved') return;

  const draft = approval.draft_content;
  if (!isEmailDraftContent(draft)) {
    console.warn('[approval-effects] client_brief_clarify_email missing/invalid draft_content');
    return;
  }
  if (draft.to.length === 0) {
    await logAuditFailure({
      userId: await getCurrentActor(),
      action: 'client_brief_clarify_email_send',
      tableName: 'atelier_approvals',
      recordId: approval.id,
      error: 'recipient_missing',
    }).catch(() => {});
    return;
  }

  await sendApprovedEmail({
    approval,
    recipients: draft.to,
    subject: draft.subject,
    body: draft.body,
    auditAction: 'client_brief_clarify_email_send',
  });
}

async function applyComplianceRenewalPingEffect(approval: Approval, decision: Decision) {
  if (decision !== 'approved') return;

  const draft = approval.draft_content;
  if (!isEmailDraftContent(draft)) {
    console.warn('[approval-effects] compliance_renewal_ping missing/invalid draft_content');
    return;
  }
  if (draft.to.length === 0) {
    await logAuditFailure({
      userId: await getCurrentActor(),
      action: 'compliance_renewal_ping_send',
      tableName: 'atelier_approvals',
      recordId: approval.id,
      error: 'recipient_missing',
    }).catch(() => {});
    return;
  }

  await sendApprovedEmail({
    approval,
    recipients: draft.to,
    subject: draft.subject,
    body: draft.body,
    auditAction: 'compliance_renewal_ping_send',
  });
}

// ============================================================
// Talent gallery-share request (post-delivery reminder to talent)
// ============================================================

async function applyTalentGalleryShareRequestEffect(approval: Approval, decision: Decision) {
  if (decision !== 'approved') return;

  const draft = approval.draft_content;
  if (!isEmailDraftContent(draft)) {
    console.warn('[approval-effects] talent_gallery_share_request missing/invalid draft_content');
    return;
  }
  if (draft.to.length === 0) {
    await logAuditFailure({
      userId: await getCurrentActor(),
      action: 'talent_gallery_share_request_send',
      tableName: 'atelier_approvals',
      recordId: approval.id,
      error: 'recipient_missing',
    }).catch(() => {});
    return;
  }

  await sendApprovedEmail({
    approval,
    recipients: draft.to,
    subject: draft.subject,
    body: draft.body,
    auditAction: 'talent_gallery_share_request_send',
  });
}

async function applyCrewGalleryShareRequestEffect(approval: Approval, decision: Decision) {
  if (decision !== 'approved') return;

  const draft = approval.draft_content;
  if (!isEmailDraftContent(draft)) {
    console.warn('[approval-effects] crew_gallery_share_request missing/invalid draft_content');
    return;
  }
  if (draft.to.length === 0) {
    await logAuditFailure({
      userId: await getCurrentActor(),
      action: 'crew_gallery_share_request_send',
      tableName: 'atelier_approvals',
      recordId: approval.id,
      error: 'recipient_missing',
    }).catch(() => {});
    return;
  }

  await sendApprovedEmail({
    approval,
    recipients: draft.to,
    subject: draft.subject,
    body: draft.body,
    auditAction: 'crew_gallery_share_request_send',
  });
}
