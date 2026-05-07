/**
 * Cron: Compliance expiry pings.
 *
 * Runs daily. For each active talent whose passport / drivers licence /
 * WWCC / visa is expiring in ≤30 days (and ≥0 days, i.e. not yet expired),
 * queues a draft email in `atelier_approvals` for Jasper to review.
 *
 * Doctrine: agency mail never auto-sends — every outbound email goes
 * through the human approval queue. This cron just drafts.
 *
 * Idempotency key: `compliance_{talentId}_{docType}_{expiryDate}` — safe
 * to re-run any time without creating duplicates. The expiry date is
 * baked into the key so a renewed document (with a new expiry date)
 * generates a fresh draft.
 *
 * Protected by CRON_SECRET (same pattern as post-shoot-chase).
 */

import { NextResponse, type NextRequest } from 'next/server';
import { createServiceClient } from '@/lib/supabase/service';
import { getKillSwitchState } from '@/lib/utils/kill-switch';
import { logAudit } from '@/lib/utils/audit';
import { isCronAuthorised } from '@/lib/utils/cron-auth';

const PING_THRESHOLD_DAYS = 30;

type DocType = 'passport' | 'drivers_licence' | 'wwcc' | 'visa';

const DOC_LABELS: Record<DocType, string> = {
  passport: 'passport',
  drivers_licence: "driver's licence",
  wwcc: 'Working with Children Check (WWCC)',
  visa: 'visa',
};

function daysUntil(iso: string): number {
  return Math.floor((new Date(iso).getTime() - Date.now()) / (1000 * 60 * 60 * 24));
}

function complianceEmailDraft(
  workingName: string,
  docType: DocType,
  expiry: string,
  daysLeft: number,
): { subject: string; body: string } {
  const docLabel = DOC_LABELS[docType];
  const expiryReadable = new Date(expiry).toLocaleDateString('en-AU', {
    day: 'numeric', month: 'long', year: 'numeric',
  });

  // Jasper's voice: direct, no greeting fluff, no exclamation marks.
  const subject = `${workingName} — ${docLabel} expiring ${expiryReadable}`;
  const body = `Hi ${workingName.split(' ')[0]},

Quick heads-up that your ${docLabel} on file with us expires on ${expiryReadable} — that's ${daysLeft} day${daysLeft === 1 ? '' : 's'} from now.

When you renew, send through the new expiry date (and a copy of the document if you can) and I'll update our records.

Best,
Jasper Bailey
Saunders & Co
info@saundersandco.com.au`;

  return { subject, body };
}

export async function GET(req: NextRequest) {
  if (!isCronAuthorised(req, 'COMPLIANCE_PINGS')) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  // Doctrine: kill switch RED defers automation.
  const ks = await getKillSwitchState();
  if (ks?.is_active) {
    return NextResponse.json({ skipped: 'kill_switch_active' });
  }

  const supabase = createServiceClient();

  const { data: talent, error: fetchErr } = await supabase
    .from('atelier_talent')
    .select('id, working_name, email, is_active, passport_expiry, drivers_licence_expiry, wwcc_expiry, visa_expiry')
    .eq('is_active', true)
    .limit(500);

  if (fetchErr) {
    console.error('[cron/compliance-pings] fetch error', fetchErr.message);
    await logAudit({
      userId: null,
      action: 'cron_compliance_pings_failed',
      tableName: 'atelier_talent',
      newValue: { error: fetchErr.message },
    }).catch(() => {});
    return NextResponse.json({ error: fetchErr.message }, { status: 500 });
  }

  let queued = 0;
  const skipped: string[] = [];

  for (const t of talent ?? []) {
    if (!t.email) continue; // can't email without an address

    const docs: Array<{ type: DocType; expiry: string | null }> = [
      { type: 'passport',        expiry: t.passport_expiry as string | null },
      { type: 'drivers_licence', expiry: t.drivers_licence_expiry as string | null },
      { type: 'wwcc',            expiry: t.wwcc_expiry as string | null },
      { type: 'visa',            expiry: t.visa_expiry as string | null },
    ];

    for (const { type, expiry } of docs) {
      if (!expiry) continue;
      const days = daysUntil(expiry);
      if (days < 0 || days > PING_THRESHOLD_DAYS) continue;

      const key = `compliance_${t.id}_${type}_${expiry}`;
      const draft = complianceEmailDraft(t.working_name as string, type, expiry, days);

      const { error: insertErr } = await supabase.from('atelier_approvals').insert({
        agent: 'comms',
        action_type: 'compliance_renewal_ping',
        booking_id: null, // not associated with a booking
        summary: `${t.working_name} — ${DOC_LABELS[type]} expires in ${days}d`,
        draft_content: {
          to: [t.email],
          subject: draft.subject,
          body: draft.body,
          talent_id: t.id,
          doc_type: type,
          expiry_date: expiry,
          days_until_expiry: days,
        },
        confidence: 95,
        uncertainty_sources: days <= 7
          ? ['Document expires within 7 days — consider phoning instead of emailing']
          : [],
        idempotency_key: key,
        status: 'pending',
      });

      if (insertErr) {
        if (insertErr.code === '23505') {
          skipped.push(key);
        } else {
          console.error('[cron/compliance-pings] insert error', key, insertErr.message);
        }
      } else {
        queued++;
        console.log('[cron/compliance-pings] queued', key);
      }
    }
  }

  // ============================================================
  // Business renewals sweep (PR#34) — agency-side reminders to Jasper.
  // ============================================================
  const agencyEmail = process.env.NEXT_PUBLIC_AGENCY_EMAIL ?? 'info@saundersandco.com.au';

  const { data: renewals, error: renewalsErr } = await supabase
    .from('atelier_business_renewals')
    .select('id, type, label, expires_at, notes')
    .eq('is_archived', false);

  if (renewalsErr) {
    console.error('[cron/compliance-pings] business renewals fetch error', renewalsErr.message);
    await logAudit({
      userId: null,
      action: 'cron_business_renewals_failed',
      tableName: 'atelier_business_renewals',
      newValue: { error: renewalsErr.message },
    }).catch(() => {});
  }

  for (const r of renewals ?? []) {
    const expiresAt = r.expires_at as string;
    const days = daysUntil(expiresAt);
    if (days < 0 || days > PING_THRESHOLD_DAYS) continue;

    const expiryReadable = new Date(expiresAt).toLocaleDateString('en-AU', {
      day: 'numeric', month: 'long', year: 'numeric',
    });
    const subject = `Reminder: ${r.label} expires ${expiryReadable}`;
    const body = `Hi Jasper,

Quick reminder — ${r.label} is due on ${expiryReadable} (${days} day${days === 1 ? '' : 's'} from now).

${r.notes ? `Notes on file: ${r.notes}\n\n` : ''}Action this before the expiry to avoid lapsing.

— Atelier`;

    const key = `business_renewal_${r.id}_${expiresAt}`;
    const { error: insertErr } = await supabase.from('atelier_approvals').insert({
      agent: 'comms',
      action_type: 'business_renewal_reminder',
      booking_id: null,
      summary: `${r.label} expires in ${days}d`,
      draft_content: {
        to: [agencyEmail],
        subject,
        body,
        renewal_id: r.id,
        renewal_type: r.type,
        expiry_date: expiresAt,
        days_until_expiry: days,
      },
      confidence: 100,
      uncertainty_sources: [],
      idempotency_key: key,
      status: 'pending',
    });

    if (insertErr) {
      if (insertErr.code === '23505') {
        skipped.push(key);
      } else {
        console.error('[cron/compliance-pings] business insert error', key, insertErr.message);
      }
    } else {
      // Mark the row so the dashboard can show "reminder queued"
      await supabase
        .from('atelier_business_renewals')
        .update({ reminder_queued_at: new Date().toISOString() })
        .eq('id', r.id);
      queued++;
      console.log('[cron/compliance-pings] business queued', key);
    }
  }

  return NextResponse.json({ queued, skipped: skipped.length });
}
