'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { createEdm, updateEdm, deleteEdm, getEdm } from '@/lib/data/edms';
import { getCurrentAppUser } from '@/lib/data/app-users';
import { getCurrentActor } from '@/lib/utils/actor';
import { logAudit } from '@/lib/utils/audit';
import { renderEdmHtml } from '@/lib/edms/templates';
import { draftEmail } from '@/lib/integrations/gmail';
import { getAgencyConfig } from '@/lib/utils/agency-config';
import type { EdmTemplate } from '@/lib/types/database';

async function requireOwnerOrPartner(): Promise<{ error: string } | null> {
  const user = await getCurrentAppUser();
  if (!user || (user.role !== 'owner' && user.role !== 'partner')) return { error: 'Forbidden' };
  return null;
}

export async function createEdmAction(formData: FormData): Promise<void> {
  const auth = await requireOwnerOrPartner();
  if (auth) throw new Error(auth.error);

  const template = String(formData.get('template') ?? '');
  const title = String(formData.get('title') ?? '').trim();
  if (template !== 'monthly_roundup' && template !== 'artist_campaign') {
    throw new Error('Invalid template');
  }
  if (!title) throw new Error('Title required');

  const userId = await getCurrentActor();
  const edm = await createEdm({ template: template as EdmTemplate, title, created_by: userId });
  if (!edm) throw new Error('Failed to create EDM');

  await logAudit({
    userId,
    action: 'create_edm',
    tableName: 'atelier_edms',
    recordId: edm.id,
    newValue: { template, title },
  }).catch(() => {});

  revalidatePath('/edms');
  redirect(`/edms/${edm.id}`);
}

export async function updateEdmAction(input: {
  id: string;
  title?: string;
  subject?: string | null;
  preheader?: string | null;
  payload?: unknown;
}): Promise<{ ok: true } | { ok: false; error: string }> {
  const auth = await requireOwnerOrPartner();
  if (auth) return { ok: false, error: auth.error };

  const result = await updateEdm(input.id, {
    title: input.title,
    subject: input.subject,
    preheader: input.preheader,
    payload: input.payload,
  });
  if (!result.ok) return result;

  await logAudit({
    userId: await getCurrentActor(),
    action: 'update_edm',
    tableName: 'atelier_edms',
    recordId: input.id,
  }).catch(() => {});

  revalidatePath(`/edms/${input.id}`);
  revalidatePath('/edms');
  return { ok: true };
}

export async function deleteEdmAction(id: string): Promise<{ ok: true } | { ok: false; error: string }> {
  const auth = await requireOwnerOrPartner();
  if (auth) return { ok: false, error: auth.error };

  const result = await deleteEdm(id);
  if (!result.ok) return result;

  await logAudit({
    userId: await getCurrentActor(),
    action: 'delete_edm',
    tableName: 'atelier_edms',
    recordId: id,
  }).catch(() => {});

  revalidatePath('/edms');
  return { ok: true };
}

/**
 * Create a Gmail draft from the EDM. The draft has no `To:` — Jasper
 * pastes recipients in Gmail itself (Tier 1: no list management).
 * Returns the draft id so the UI can deep-link to Gmail drafts.
 */
export async function createEdmGmailDraftAction(
  id: string,
): Promise<{ ok: true; draftId: string } | { ok: false; error: string }> {
  const auth = await requireOwnerOrPartner();
  if (auth) return { ok: false, error: auth.error };

  const edm = await getEdm(id);
  if (!edm) return { ok: false, error: 'EDM not found' };
  if (!edm.subject?.trim()) return { ok: false, error: 'Set a subject line first.' };

  const html = renderEdmHtml(edm.template, edm.payload, edm.preheader);
  const cfg = getAgencyConfig();
  const fromAddr = cfg.email ?? undefined;

  try {
    const { draftId } = await draftEmail({
      to: [],
      subject: edm.subject,
      body: html,
      bodyType: 'html',
      from: fromAddr,
    });

    await updateEdm(id, { gmail_draft_id: draftId });

    await logAudit({
      userId: await getCurrentActor(),
      action: 'create_edm_gmail_draft',
      tableName: 'atelier_edms',
      recordId: id,
      newValue: { draftId },
    }).catch(() => {});

    revalidatePath(`/edms/${id}`);
    return { ok: true, draftId };
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Unknown error';
    return { ok: false, error: msg };
  }
}

export async function markEdmSentAction(id: string): Promise<{ ok: true } | { ok: false; error: string }> {
  const auth = await requireOwnerOrPartner();
  if (auth) return { ok: false, error: auth.error };

  const result = await updateEdm(id, { status: 'sent', sent_at: new Date().toISOString() });
  if (!result.ok) return result;

  await logAudit({
    userId: await getCurrentActor(),
    action: 'mark_edm_sent',
    tableName: 'atelier_edms',
    recordId: id,
  }).catch(() => {});

  revalidatePath('/edms');
  revalidatePath(`/edms/${id}`);
  return { ok: true };
}

export async function archiveEdmAction(id: string): Promise<{ ok: true } | { ok: false; error: string }> {
  const auth = await requireOwnerOrPartner();
  if (auth) return { ok: false, error: auth.error };
  const result = await updateEdm(id, { status: 'archived' });
  if (!result.ok) return result;
  revalidatePath('/edms');
  return { ok: true };
}
