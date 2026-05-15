'use server';

import { revalidatePath } from 'next/cache';
import { dismissBriefCandidate, undismissBriefCandidate } from '@/lib/data/dismissed-briefs';
import { getCurrentAppUser } from '@/lib/data/app-users';
import { getCurrentActor } from '@/lib/utils/actor';
import { logAudit } from '@/lib/utils/audit';

async function requireOwnerOrPartner(): Promise<{ error: string } | null> {
  const user = await getCurrentAppUser();
  if (!user || (user.role !== 'owner' && user.role !== 'partner')) return { error: 'Forbidden' };
  return null;
}

/**
 * Mark a Gmail message as "Not a brief" so it stops appearing in
 * Potential Briefs across page refreshes. Idempotent — calling repeatedly
 * on the same message_id has no extra effect.
 *
 * Undo is supported via undismissBriefCandidateAction, both inside the
 * 8s toast window and later via "Show N dismissed" on the panel.
 */
export async function dismissBriefCandidateAction(opts: {
  gmail_message_id: string;
  subject: string | null;
  from_header: string | null;
  received_at: string | null;
}): Promise<{ ok: true } | { ok: false; error: string }> {
  const auth = await requireOwnerOrPartner();
  if (auth) return { ok: false, error: auth.error };
  if (!opts.gmail_message_id) return { ok: false, error: 'gmail_message_id required' };

  const userId = await getCurrentActor();
  const result = await dismissBriefCandidate({
    gmail_message_id: opts.gmail_message_id,
    subject: opts.subject,
    from_header: opts.from_header,
    received_at: opts.received_at,
    dismissed_by: userId,
  });
  if (!result.ok) return result;

  await logAudit({
    userId,
    action: 'dismiss_brief_candidate',
    tableName: 'atelier_dismissed_brief_candidates',
    recordId: opts.gmail_message_id,
    newValue: { subject: opts.subject, from_header: opts.from_header },
  }).catch(() => {});

  revalidatePath('/inbox');
  return { ok: true };
}

/**
 * Undo a dismissal. Deletes the row so the message re-enters Potential
 * Briefs on the next scan. Safe to call on a non-existent dismissal — the
 * DELETE simply affects 0 rows.
 */
export async function undismissBriefCandidateAction(
  gmail_message_id: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const auth = await requireOwnerOrPartner();
  if (auth) return { ok: false, error: auth.error };
  if (!gmail_message_id) return { ok: false, error: 'gmail_message_id required' };

  const result = await undismissBriefCandidate(gmail_message_id);
  if (!result.ok) return result;

  await logAudit({
    userId: await getCurrentActor(),
    action: 'undismiss_brief_candidate',
    tableName: 'atelier_dismissed_brief_candidates',
    recordId: gmail_message_id,
  }).catch(() => {});

  revalidatePath('/inbox');
  return { ok: true };
}
