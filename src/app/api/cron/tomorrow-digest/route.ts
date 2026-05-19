/**
 * Cron: "Tomorrow's shoot" digest.
 *
 * Runs at 20:00 UTC daily (06:00 AEST) — start of Sydney's working day.
 * Sends Jasper a single internal email summarising every shoot
 * happening tomorrow: booking ref, title, client, location, dates,
 * full team contact details, dietary requirements, drink orders.
 *
 * Why: producers re-check tomorrow's booking before they head out the
 * door. Pulling those details out of Atelier means opening multiple
 * tabs. This digest puts everything in one inbox.
 *
 * Internal email (sent to NEXT_PUBLIC_AGENCY_EMAIL), not approval-gated
 * — it's a self-reminder, not client-facing comms. Skips silently if
 * there's nothing happening tomorrow.
 *
 * Protected by CRON_SECRET / CRON_SECRET_TOMORROW_DIGEST.
 */

import { NextResponse, type NextRequest } from 'next/server';
import { createServiceClient } from '@/lib/supabase/service';
import { getBookingsRoster } from '@/lib/data/booking-roster';
import { sendEmail } from '@/lib/integrations/gmail';
import { isGoogleConfigured } from '@/lib/integrations/google-auth';
import { isCronAuthorised } from '@/lib/utils/cron-auth';
import { getKillSwitchState } from '@/lib/utils/kill-switch';
import { logAudit, logAuditFailure } from '@/lib/utils/audit';
import { humanise } from '@/lib/utils/humanise';
import { getAgencyConfig } from '@/lib/utils/agency-config';

export const dynamic = 'force-dynamic';

/** YYYY-MM-DD for "tomorrow" in agency timezone (Australia/Sydney). */
function tomorrowYmdSydney(): string {
  const d = new Date();
  // Convert to Sydney via toLocaleString round-trip
  const sydneyNow = new Date(d.toLocaleString('en-US', { timeZone: 'Australia/Sydney' }));
  sydneyNow.setDate(sydneyNow.getDate() + 1);
  const y = sydneyNow.getFullYear();
  const m = String(sydneyNow.getMonth() + 1).padStart(2, '0');
  const day = String(sydneyNow.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function escapeHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

export async function GET(req: NextRequest) {
  if (!isCronAuthorised(req, 'TOMORROW_DIGEST')) {
    return new NextResponse('Unauthorised', { status: 401 });
  }

  // Doctrine: every outbound-bearing cron defers when kill switch is RED.
  // This digest emails Jasper, which is "internal" outbound — but the
  // rule is uniform across crons so we don't have a class of bypass.
  const ks = await getKillSwitchState();
  if (ks?.is_active) {
    return NextResponse.json({ skipped: 'kill_switch_active' });
  }

  await logAudit({ userId: null, action: 'cron_tomorrow_digest_run', tableName: 'atelier_audit_log', newValue: { startedAt: new Date().toISOString() } }).catch(() => {});

  const tomorrow = tomorrowYmdSydney();
  const supabase = createServiceClient();

  // Find bookings whose shoot_dates intersect tomorrow. Postgres
  // serialises a daterange as "[YYYY-MM-DD,YYYY-MM-DD)" with the upper
  // bound exclusive. We pull every active-ish booking and filter in JS
  // (volume is tiny — at most a few dozen rows).
  // brand:atelier_brands join dropped 2026-05-19 — migration 0071
  // removed atelier_bookings.brand_id. brandLabel below now always null.
  const { data: bookings, error } = await supabase
    .from('atelier_bookings')
    .select(`
      id, booking_ref, title, state, shoot_dates, shoot_location, shoot_date_notes,
      client:atelier_clients!atelier_bookings_client_id_fkey(name, company)
    `)
    .in('state', ['quote_confirmed', 'pre_production', 'shoot_live'])
    .eq('is_archived', false)
    .not('shoot_dates', 'is', null);

  if (error) {
    await logAuditFailure({
      userId: null,
      action: 'cron_tomorrow_digest_failed',
      tableName: 'atelier_bookings',
      recordId: null,
      error: error.message,
    }).catch(() => {});
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  }

  type BookingRow = {
    id: string;
    booking_ref: string | null;
    title: string;
    state: string;
    shoot_dates: string;
    shoot_location: string | null;
    shoot_date_notes: string | null;
    client?: { name?: string; company?: string | null } | null;
    brand?: { name?: string } | null;
  };
  const all = (bookings ?? []) as unknown as BookingRow[];

  // Filter to those that include `tomorrow`. Daterange is inclusive of
  // the lower bound and exclusive of the upper.
  const matching = all.filter((b) => {
    const m = b.shoot_dates.match(/[\[(]([\d-]+),([\d-]+)?[\])]/);
    if (!m || !m[1]) return false;
    const start = m[1];
    const endExclusive = m[2] ?? start;
    return start <= tomorrow && tomorrow < endExclusive;
  });

  if (matching.length === 0) {
    // Don't send empty digests — skip silently.
    await logAudit({
      userId: null,
      action: 'cron_tomorrow_digest_empty',
      tableName: 'atelier_bookings',
      recordId: null,
      newValue: { tomorrow, scanned: all.length },
    }).catch(() => {});
    await logAudit({ userId: null, action: 'cron_tomorrow_digest_complete', tableName: 'atelier_audit_log', newValue: { sent: 0, reason: 'empty' } }).catch(() => {});
    return NextResponse.json({ ok: true, sent: 0, scanned: all.length });
  }

  // Pull rosters for the matching bookings in one batched call.
  const rosterMap = await getBookingsRoster(matching.map((b) => b.id));

  // Build the digest HTML.
  const agency = getAgencyConfig();
  const recipient = agency.email;
  if (!recipient) {
    return NextResponse.json({ ok: false, error: 'NEXT_PUBLIC_AGENCY_EMAIL not set' }, { status: 500 });
  }

  const sydneyDate = new Date(`${tomorrow}T09:00:00+11:00`);
  const dateLabel = sydneyDate.toLocaleDateString('en-AU', {
    weekday: 'long', day: 'numeric', month: 'long', year: 'numeric',
    timeZone: 'Australia/Sydney',
  });

  const html = buildDigestHtml({ matching, rosterMap, dateLabel });
  const subject = matching.length === 1
    ? `Tomorrow: ${matching[0].booking_ref ?? matching[0].title}`
    : `Tomorrow: ${matching.length} shoots`;

  if (!isGoogleConfigured()) {
    // Dev fallback — log the digest but don't try to send.
    console.log('[cron/tomorrow-digest] Google not configured; would send to', recipient);
    await logAudit({
      userId: null,
      action: 'cron_tomorrow_digest_skipped_no_google',
      tableName: 'atelier_bookings',
      recordId: null,
      newValue: { tomorrow, count: matching.length },
    }).catch(() => {});
    await logAudit({ userId: null, action: 'cron_tomorrow_digest_complete', tableName: 'atelier_audit_log', newValue: { sent: 0, reason: 'no_google' } }).catch(() => {});
    return NextResponse.json({ ok: true, sent: 0, count: matching.length, mode: 'no_google' });
  }

  try {
    await sendEmail({ to: [recipient], subject, body: html });
    await logAudit({
      userId: null,
      action: 'cron_tomorrow_digest_sent',
      tableName: 'atelier_bookings',
      recordId: null,
      newValue: { tomorrow, count: matching.length, recipient },
    }).catch(() => {});
    await logAudit({ userId: null, action: 'cron_tomorrow_digest_complete', tableName: 'atelier_audit_log', newValue: { sent: 1, count: matching.length } }).catch(() => {});
    return NextResponse.json({ ok: true, sent: 1, count: matching.length });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    await logAuditFailure({
      userId: null,
      action: 'cron_tomorrow_digest_send_failed',
      tableName: 'atelier_bookings',
      recordId: null,
      error: msg,
    }).catch(() => {});
    return NextResponse.json({ ok: false, error: msg }, { status: 500 });
  }
}

function buildDigestHtml(opts: {
  matching: Array<{
    id: string;
    booking_ref: string | null;
    title: string;
    state: string;
    shoot_dates: string;
    shoot_location: string | null;
    shoot_date_notes: string | null;
    client?: { name?: string; company?: string | null } | null;
    brand?: { name?: string } | null;
  }>;
  rosterMap: Map<string, { talent: Array<{ name: string; mobile: string | null; email: string | null; dietary: string | null; drink_order: string | null; role: string | null }>; crew: Array<{ name: string; mobile: string | null; email: string | null; dietary: string | null; drink_order: string | null; role: string | null; city: string | null }> }>;
  dateLabel: string;
}): string {
  const { matching, rosterMap, dateLabel } = opts;

  const blocks = matching.map((b) => {
    const roster = rosterMap.get(b.id);
    const clientLabel = b.client?.company || b.client?.name || null;
    const brandLabel = b.brand?.name || null;
    const headerLine = [b.booking_ref, b.title, clientLabel].filter(Boolean).join(' · ');

    const talentRows = (roster?.talent ?? []).map((p) => personRow(p, false)).join('');
    const crewRows = (roster?.crew ?? []).map((p) => personRow(p, true)).join('');

    return `
      <table cellpadding="0" cellspacing="0" border="0" style="width:100%; margin-bottom:32px; border:1px solid #e8e8e8; border-radius:8px; overflow:hidden;">
        <tr><td style="padding:14px 16px; background:#f8f8f8; border-bottom:1px solid #e8e8e8;">
          <div style="font-size:14px; font-weight:600; color:#1a1a1a;">${escapeHtml(headerLine)}</div>
          ${brandLabel ? `<div style="margin-top:2px; font-size:12px; color:#666;">${escapeHtml(brandLabel)}</div>` : ''}
          ${b.shoot_date_notes ? `<div style="margin-top:2px; font-size:12px; color:#666;">${escapeHtml(b.shoot_date_notes)}</div>` : ''}
          ${b.shoot_location ? `<div style="margin-top:2px; font-size:12px; color:#666;">${escapeHtml(b.shoot_location)}</div>` : ''}
        </td></tr>
        ${roster?.talent.length ? `
          <tr><td style="padding:10px 16px 6px; font-size:10px; font-weight:700; text-transform:uppercase; letter-spacing:0.06em; color:#888;">Artists</td></tr>
          ${talentRows}
        ` : ''}
        ${roster?.crew.length ? `
          <tr><td style="padding:10px 16px 6px; font-size:10px; font-weight:700; text-transform:uppercase; letter-spacing:0.06em; color:#888;">Crew</td></tr>
          ${crewRows}
        ` : ''}
        ${(!roster || (roster.talent.length === 0 && roster.crew.length === 0)) ? `
          <tr><td style="padding:14px 16px; font-size:12px; color:#888;">No talent or crew attached yet.</td></tr>
        ` : ''}
      </table>
    `;
  }).join('');

  return `<!doctype html>
<html><body style="margin:0; padding:24px; background:#f4f4f4; font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif; color:#1a1a1a;">
  <div style="max-width:680px; margin:0 auto;">
    <div style="margin-bottom:24px;">
      <div style="font-size:11px; font-weight:600; text-transform:uppercase; letter-spacing:0.08em; color:#888;">Tomorrow</div>
      <div style="margin-top:4px; font-size:20px; font-weight:700; color:#1a1a1a;">${escapeHtml(dateLabel)}</div>
      <div style="margin-top:4px; font-size:13px; color:#666;">${matching.length} shoot${matching.length === 1 ? '' : 's'}.</div>
    </div>
    ${blocks}
    <div style="margin-top:32px; font-size:11px; color:#999; text-align:center;">
      Auto-generated by Atelier — adjust at <a href="https://atelier.saundersandco.com.au/bookings?view=calendar" style="color:#5a7bff;">/bookings</a>
    </div>
  </div>
</body></html>`;
}

function personRow(
  p: { name: string; mobile: string | null; dietary: string | null; drink_order: string | null; role: string | null; city?: string | null },
  showCity: boolean,
): string {
  const isNilDiet = p.dietary && /^nil( diet)?$/i.test(p.dietary.trim());
  const dietary = isNilDiet ? null : p.dietary;
  const roleLabel = p.role ? humanise(p.role) : null;
  const lineParts: string[] = [];
  if (p.mobile) lineParts.push(`<a href="tel:${escapeHtml(p.mobile)}" style="color:#5a7bff; text-decoration:none;">${escapeHtml(p.mobile)}</a>`);
  if (showCity && p.city) lineParts.push(escapeHtml(p.city));
  if (dietary) lineParts.push(`Dietary: ${escapeHtml(dietary)}`);
  if (p.drink_order) lineParts.push(`Drink: ${escapeHtml(p.drink_order)}`);
  return `
    <tr><td style="padding:6px 16px 10px; border-top:1px solid #f0f0f0;">
      ${roleLabel ? `<div style="font-size:10px; color:#999; text-transform:uppercase; letter-spacing:0.05em;">${escapeHtml(roleLabel)}</div>` : ''}
      <div style="font-size:13px; font-weight:600; color:#1a1a1a;">${escapeHtml(p.name)}</div>
      ${lineParts.length ? `<div style="font-size:12px; color:#555;">${lineParts.join(' · ')}</div>` : ''}
    </td></tr>
  `;
}
