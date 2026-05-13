'use server';

import { revalidatePath } from 'next/cache';
import {
  generateOnboardingToken,
  applyOnboardingByToken,
  type OnboardingEntityType,
  type OnboardingPayload,
} from '@/lib/data/onboarding';
import { sendEmail } from '@/lib/integrations/gmail';
import { isGoogleConfigured } from '@/lib/integrations/google-auth';
import { checkKillSwitch } from '@/lib/utils/kill-switch';
import { getAgencyConfig } from '@/lib/utils/agency-config';
import { logAudit, logAuditFailure } from '@/lib/utils/audit';
import { getCurrentActor } from '@/lib/utils/actor';
import { createServiceClient } from '@/lib/supabase/service';

const APP_URL = process.env.NEXT_PUBLIC_APP_URL ?? 'https://atelier.saundersandco.com.au';

/**
 * Generate a fresh onboarding token for a talent or crew member and email
 * them a magic link. The link sends them to /onboard/[token] where they
 * can fill in (or correct) their own details.
 *
 * Behaviour:
 *   - Always generates a NEW token, overwriting any old one (rotation
 *     handles "they lost the link" without an extra UI affordance).
 *   - If Gmail isn't configured, returns the link directly so the owner
 *     can paste it manually.
 *   - Adds a row to the audit log either way.
 */
export async function sendOnboardingLinkAction(
  type: OnboardingEntityType,
  entityId: string,
): Promise<
  | { ok: true; mode: 'sent'; to: string }
  | { ok: true; mode: 'manual'; url: string; reason: string }
  | { ok: false; error: string }
> {
  // 1. Look up the entity's email + display name
  const supabase = createServiceClient();
  const table = type === 'talent' ? 'atelier_talent' : 'atelier_crew';

  let email: string | null = null;
  let displayName = '';

  if (type === 'talent') {
    const { data, error } = await supabase
      .from('atelier_talent')
      .select('id, email, working_name, legal_name')
      .eq('id', entityId)
      .maybeSingle();
    if (error || !data) return { ok: false, error: 'Could not find that record.' };
    email = data.email;
    displayName = data.working_name || data.legal_name || '';
  } else {
    const { data, error } = await supabase
      .from('atelier_crew')
      .select('id, email, name')
      .eq('id', entityId)
      .maybeSingle();
    if (error || !data) return { ok: false, error: 'Could not find that record.' };
    email = data.email;
    displayName = data.name || '';
  }

  if (!email) {
    return { ok: false, error: 'This person has no email on file. Add one first.' };
  }

  // 2. Generate the token
  const token = await generateOnboardingToken(type, entityId);
  if (!token) {
    return { ok: false, error: 'Could not generate an onboarding link.' };
  }

  const url = `${APP_URL}/onboard/${token}`;

  // 3. Audit it
  await logAudit({
    userId: await getCurrentActor(),
    action: 'send_onboarding_link',
    tableName: table,
    recordId: entityId,
    newValue: { url, expires_in_days: 14 } as unknown as import('@/lib/types/database').Json,
  });

  // 4. Send (or fall back to manual)
  if (!isGoogleConfigured()) {
    return {
      ok: true,
      mode: 'manual',
      url,
      reason: 'Gmail isn\'t configured — paste this link to them yourself.',
    };
  }

  const ks = await checkKillSwitch();
  if (!ks.canSendOutbound) {
    return { ok: true, mode: 'manual', url, reason: 'Outbound email is paused — paste this link to them yourself.' };
  }

  try {
    await sendEmail({
      to: [email],
      subject: `Your ${getAgencyConfig().name} onboarding link`,
      bodyType: 'html',
      body: buildOnboardingEmailHtml({ displayName, url }),
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    await logAuditFailure({
      userId: await getCurrentActor(),
      action: 'send_onboarding_link',
      tableName: table,
      recordId: entityId,
      attempted: { email, url } as unknown as import('@/lib/types/database').Json,
      error: msg,
    });
    return { ok: false, error: `Email send failed: ${msg}` };
  }

  revalidatePath(type === 'talent' ? `/talent/${entityId}` : `/crew/${entityId}`);

  return { ok: true, mode: 'sent', to: email };
}

function buildOnboardingEmailHtml(opts: { displayName: string; url: string }): string {
  return [
    `<p>Hi ${opts.displayName || 'there'},</p>`,
    `<p>This is your personal link to update your details with Saunders &amp; Co — name, contact, ABN, super fund, address, and your default day rate.</p>`,
    `<p style="margin:20px 0"><a href="${opts.url}" style="display:inline-block;padding:10px 20px;background:#1a1a1a;color:#fff;text-decoration:none;border-radius:4px;font-size:13px;font-weight:600">Update my details</a></p>`,
    `<p style="font-size:11px;color:#999">The link expires in 14 days. You can come back to this URL any time within that window: <a href="${opts.url}" style="color:#999">${opts.url}</a></p>`,
    `<p style="margin-top:24px">Jasper Bailey<br>Saunders &amp; Co<br><a href="mailto:info@saundersandco.com.au">info@saundersandco.com.au</a></p>`,
  ].join('\n');
}

/**
 * Public-facing submit action. Called from the /onboard/[token] form.
 * Token validates the request — no other auth required.
 */
export async function submitOnboardingAction(
  token: string,
  payload: OnboardingPayload,
): Promise<{ ok: true; type: OnboardingEntityType } | { ok: false; error: string }> {
  if (!token) return { ok: false, error: 'Missing onboarding token.' };
  if (!payload.legal_name || !payload.email) {
    return { ok: false, error: 'Legal name and email are required.' };
  }

  const result = await applyOnboardingByToken(token, payload);
  if (!result.ok) return result;

  // Notify owner that someone completed their onboarding
  await logAudit({
    userId: null,
    action: 'self_onboard_completed',
    tableName: result.type === 'talent' ? 'atelier_talent' : 'atelier_crew',
    recordId: null,
    newValue: { legal_name: payload.legal_name, email: payload.email } as unknown as import('@/lib/types/database').Json,
  });

  return result;
}
