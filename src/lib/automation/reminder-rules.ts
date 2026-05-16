/**
 * Reminder rules — what gets queued by /api/cron/scheduled-comms.
 *
 * Before 2026-05 this lived as four separate cron routes (`quote-chase`,
 * `post-shoot-chase`, `talent-gallery-ping`, `compliance-pings`) that all
 * had the same shape: auth check → kill-switch gate → log _run → match
 * rows → build template email → insert approval row (idempotent) → log
 * _complete. ~600 LOC of boilerplate across the 4 routes.
 *
 * This module factors the boilerplate to one route + a rules array. Each
 * rule has a stable id, a label for logs, and an async `match` function
 * that returns the approval-row payloads to queue. Adding a new reminder
 * type is a new array entry, not a new cron route.
 *
 * What's unified:
 *   - Quote-chase (day 3/7/14/21 after quote_sent_at)
 *   - Post-shoot client chase (day 7/14/22/30 after final_delivery_at)
 *   - Gallery share request — talent (≥1d after final_delivery_at)
 *   - Gallery share request — crew (digital roles only, same trigger)
 *   - Talent compliance document expiry (passport / licence / WWCC / visa ≤30d)
 *   - Agency business renewals (insurance / BAS / ASIC etc. ≤30d)
 *
 * What's intentionally NOT in this module (separate cron routes remain):
 *   - lock-ot-windows (state transition, not a reminder)
 *   - data-retention (destructive cleanup)
 *   - auto-anonymise (destructive cleanup)
 *   - tomorrow-digest (direct email to Jasper, no approval queue)
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import { buildQuoteChaseEmail, buildPostShootChaseEmail } from '@/lib/utils/comms-tone';
import { getAgencyConfig } from '@/lib/utils/agency-config';
import type { CommunicationStyle } from '@/lib/types/database';

/** A single approval-row payload ready to insert. */
export type ReminderMatch = {
  idempotencyKey: string;
  /**
   * action_type for the approval row. Must match a handler branch in
   * src/lib/automation/approval-effects.ts or the approve click silently
   * no-ops.
   */
  actionType:
    | 'client_quote_chase_email'
    | 'client_chase_email'
    | 'talent_gallery_share_request'
    | 'crew_gallery_share_request'
    | 'compliance_renewal_ping'
    | 'business_renewal_reminder';
  summary: string;
  /** Drives the inbox card UI + the eventual sendEmail() call. Must include `to`, `subject`, `body`. */
  draftContent: Record<string, unknown>;
  bookingId: string | null;
  confidence?: number;
  uncertaintySources?: string[];
  /**
   * Optional side effect to run AFTER the approval row is successfully
   * inserted (i.e. NOT on idempotency-key collisions). Used today only
   * by business_renewal_reminder to set `reminder_queued_at` on the
   * source row.
   */
  onQueued?: () => Promise<void>;
};

export type ReminderRule = {
  id: string;
  label: string;
  match: (supabase: SupabaseClient) => Promise<ReminderMatch[]>;
};

// ============================================================
// Helpers
// ============================================================

function daysSince(ts: string): number {
  return Math.floor((Date.now() - new Date(ts).getTime()) / (1000 * 60 * 60 * 24));
}

function daysUntil(iso: string): number {
  return Math.floor((new Date(iso).getTime() - Date.now()) / (1000 * 60 * 60 * 24));
}

/** PostgREST may return a 1:1 join as either a single object or a 1-element array. */
function unwrap<T>(value: T | T[] | null): T | null {
  if (value === null || value === undefined) return null;
  return Array.isArray(value) ? value[0] ?? null : value;
}

// ============================================================
// Rule: quote chase (day 3/7/14/21 after quote_sent_at)
// ============================================================

const QUOTE_CHASE_MARKS = [3, 7, 14, 21] as const;

async function quoteChaseMatches(supabase: SupabaseClient): Promise<ReminderMatch[]> {
  const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
  const threeDaysAgo  = new Date(Date.now() -  3 * 24 * 60 * 60 * 1000).toISOString();

  const { data, error } = await supabase
    .from('atelier_bookings')
    .select(`
      id, booking_ref, title, quote_sent_at,
      client:atelier_clients!atelier_bookings_client_id_fkey(name, company, email, communication_style)
    `)
    .eq('state', 'quote_sent')
    .not('quote_sent_at', 'is', null)
    .lte('quote_sent_at', threeDaysAgo)
    .gte('quote_sent_at', thirtyDaysAgo)
    .limit(500);

  if (error) throw new Error(`quote-chase fetch: ${error.message}`);

  const out: ReminderMatch[] = [];
  for (const b of data ?? []) {
    if (!b.quote_sent_at || !b.booking_ref) continue;
    const days = daysSince(b.quote_sent_at as string);
    const client = unwrap(b.client as unknown as {
      name: string; company: string | null; email: string | null;
      communication_style: CommunicationStyle | null;
    } | { name: string; company: string | null; email: string | null;
      communication_style: CommunicationStyle | null }[] | null);
    if (!client?.email) continue;

    const clientName = client.company ?? client.name ?? 'there';

    for (const mark of QUOTE_CHASE_MARKS) {
      if (days < mark) continue;
      const draft = buildQuoteChaseEmail({
        style: client.communication_style ?? null,
        dayMark: mark,
        bookingRef: b.booking_ref as string,
        bookingTitle: b.title as string,
        clientName,
      });
      out.push({
        idempotencyKey: `quote_chase_${b.id}_${mark}`,
        actionType: 'client_quote_chase_email',
        summary: `Day-${mark} quote chase — ${b.booking_ref}`,
        draftContent: {
          to: [client.email], subject: draft.subject, body: draft.body,
          day_mark: mark, booking_ref: b.booking_ref, booking_title: b.title,
          communication_style: client.communication_style,
        },
        bookingId: b.id as string,
        confidence: 90,
        uncertaintySources: mark >= 21
          ? ['Day-21 is the last automated nudge — consider phoning if this client has gone quiet']
          : [],
      });
    }
  }
  return out;
}

// ============================================================
// Rule: post-shoot chase (day 7/14/22/30 after final_delivery_at)
// ============================================================

const POST_SHOOT_MARKS = [7, 14, 22, 30] as const;

async function postShootChaseMatches(supabase: SupabaseClient): Promise<ReminderMatch[]> {
  const ninetyDaysAgo = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000).toISOString();

  const { data, error } = await supabase
    .from('atelier_bookings')
    .select(`
      id, booking_ref, final_delivery_at,
      client:atelier_clients!atelier_bookings_client_id_fkey(name, company, email, communication_style)
    `)
    .not('final_delivery_at', 'is', null)
    .gte('final_delivery_at', ninetyDaysAgo)
    .in('state', ['final_delivery', 'invoice_issued', 'paid'])
    .limit(500);

  if (error) throw new Error(`post-shoot-chase fetch: ${error.message}`);

  const out: ReminderMatch[] = [];
  for (const b of data ?? []) {
    if (!b.final_delivery_at || !b.booking_ref) continue;
    const days = daysSince(b.final_delivery_at as string);
    const client = unwrap(b.client as unknown as {
      name: string; company: string | null; email: string | null;
      communication_style: CommunicationStyle | null;
    } | { name: string; company: string | null; email: string | null;
      communication_style: CommunicationStyle | null }[] | null);
    if (!client?.email) continue;

    const clientName = client.company ?? client.name ?? 'there';

    for (const mark of POST_SHOOT_MARKS) {
      if (days < mark) continue;
      const draft = buildPostShootChaseEmail({
        style: client.communication_style ?? null,
        dayMark: mark,
        bookingRef: b.booking_ref as string,
        clientName,
      });
      out.push({
        idempotencyKey: `chase_${b.id}_${mark}`,
        actionType: 'client_chase_email',
        summary: `Day-${mark} post-shoot chase — ${b.booking_ref}`,
        draftContent: {
          to: [client.email], subject: draft.subject, body: draft.body,
          day_mark: mark, booking_ref: b.booking_ref,
          communication_style: client.communication_style,
        },
        bookingId: b.id as string,
        confidence: 90,
      });
    }
  }
  return out;
}

// ============================================================
// Rule: gallery share request (talent + crew, ≥1d after final_delivery_at)
// ============================================================

const GALLERY_CREW_ROLES = ['digital_operator', 'photo_editor', 'video_editor', 'retoucher', 'digi_tech'];

function buildGalleryEmail(opts: { recipientName: string; bookingRef: string; bookingTitle: string }) {
  const { recipientName, bookingRef, bookingTitle } = opts;
  const agency = getAgencyConfig();
  return {
    subject: `${bookingRef} — can you share your gallery?`,
    body: `Hi ${recipientName},

Hope the ${bookingTitle} shoot went well.

When you get a chance, can you share your selects or gallery link with us? It helps us wrap up delivery and keep the booking file complete.

Thanks,
${agency.ownerName}
${agency.name}`,
  };
}

async function galleryPingMatches(supabase: SupabaseClient): Promise<ReminderMatch[]> {
  const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
  const oneDayAgo     = new Date(Date.now() -  1 * 24 * 60 * 60 * 1000).toISOString();

  const { data, error } = await supabase
    .from('atelier_bookings')
    .select(`
      id, booking_ref, title, final_delivery_at,
      booking_talent:atelier_booking_talent(
        id, talent_id, confirmed,
        talent:atelier_talent!atelier_booking_talent_talent_id_fkey(id, working_name, email)
      ),
      booking_crew:atelier_booking_crew(
        id, crew_id, confirmed, role_on_booking,
        crew:atelier_crew!atelier_booking_crew_crew_id_fkey(id, name, email, primary_role)
      )
    `)
    .not('final_delivery_at', 'is', null)
    .lte('final_delivery_at', oneDayAgo)
    .gte('final_delivery_at', thirtyDaysAgo)
    .in('state', ['final_delivery', 'invoice_issued', 'paid'])
    .limit(200);

  if (error) throw new Error(`gallery-ping fetch: ${error.message}`);

  const out: ReminderMatch[] = [];
  for (const b of data ?? []) {
    if (!b.final_delivery_at || !b.booking_ref) continue;
    const days = daysSince(b.final_delivery_at as string);
    if (days < 1) continue;

    // Talent matches
    const talentRows = (b.booking_talent ?? []) as unknown as Array<{
      id: string; talent_id: string; confirmed: boolean;
      talent: { id: string; working_name: string; email: string | null }
            | { id: string; working_name: string; email: string | null }[] | null;
    }>;
    for (const bt of talentRows) {
      if (!bt.confirmed) continue;
      const talent = unwrap(bt.talent);
      if (!talent?.email) continue;
      const draft = buildGalleryEmail({
        recipientName: talent.working_name,
        bookingRef: b.booking_ref as string,
        bookingTitle: b.title as string,
      });
      out.push({
        idempotencyKey: `talent_gallery_${b.id}_${bt.talent_id}`,
        actionType: 'talent_gallery_share_request',
        summary: `Gallery-share request — ${talent.working_name} / ${b.booking_ref}`,
        draftContent: {
          to: [talent.email], subject: draft.subject, body: draft.body,
          talent_id: bt.talent_id, talent_name: talent.working_name,
          booking_ref: b.booking_ref, booking_title: b.title,
          days_since_delivery: days,
        },
        bookingId: b.id as string,
        confidence: 95,
      });
    }

    // Crew matches (digital roles only)
    const crewRows = (b.booking_crew ?? []) as unknown as Array<{
      id: string; crew_id: string; confirmed: boolean; role_on_booking: string | null;
      crew: { id: string; name: string; email: string | null; primary_role: string | null }
          | { id: string; name: string; email: string | null; primary_role: string | null }[] | null;
    }>;
    for (const bc of crewRows) {
      if (!bc.confirmed) continue;
      const crew = unwrap(bc.crew);
      if (!crew?.email) continue;
      const role = (bc.role_on_booking ?? crew.primary_role ?? '').toLowerCase();
      if (!GALLERY_CREW_ROLES.some((r) => role.includes(r.replace('_', ' ')))) continue;

      const draft = buildGalleryEmail({
        recipientName: crew.name,
        bookingRef: b.booking_ref as string,
        bookingTitle: b.title as string,
      });
      out.push({
        idempotencyKey: `crew_gallery_${b.id}_${bc.crew_id}`,
        actionType: 'crew_gallery_share_request',
        summary: `Gallery-share request (crew) — ${crew.name} / ${b.booking_ref}`,
        draftContent: {
          to: [crew.email], subject: draft.subject, body: draft.body,
          crew_id: bc.crew_id, crew_name: crew.name,
          booking_ref: b.booking_ref, booking_title: b.title,
          days_since_delivery: days,
        },
        bookingId: b.id as string,
        confidence: 95,
      });
    }
  }
  return out;
}

// ============================================================
// Rule: compliance pings (talent doc expiry ≤30d)
// ============================================================

const COMPLIANCE_THRESHOLD_DAYS = 30;
type ComplianceDocType = 'passport' | 'drivers_licence' | 'wwcc' | 'visa';
const COMPLIANCE_DOC_LABELS: Record<ComplianceDocType, string> = {
  passport: 'passport',
  drivers_licence: "driver's licence",
  wwcc: 'Working with Children Check (WWCC)',
  visa: 'visa',
};

function buildComplianceEmail(workingName: string, docType: ComplianceDocType, expiry: string, daysLeft: number) {
  const agency = getAgencyConfig();
  const docLabel = COMPLIANCE_DOC_LABELS[docType];
  const expiryReadable = new Date(expiry).toLocaleDateString('en-AU', { day: 'numeric', month: 'long', year: 'numeric' });
  return {
    subject: `${workingName} — ${docLabel} expiring ${expiryReadable}`,
    body: `Hi ${workingName.split(' ')[0]},

Quick heads-up that your ${docLabel} on file with us expires on ${expiryReadable} — that's ${daysLeft} day${daysLeft === 1 ? '' : 's'} from now.

When you renew, send through the new expiry date (and a copy of the document if you can) and I'll update our records.

Best,
${agency.ownerName}
${agency.name}${agency.email ? `\n${agency.email}` : ''}`,
  };
}

async function compliancePingMatches(supabase: SupabaseClient): Promise<ReminderMatch[]> {
  const { data, error } = await supabase
    .from('atelier_talent')
    .select('id, working_name, email, is_active, passport_expiry, drivers_licence_expiry, wwcc_expiry, visa_expiry')
    .eq('is_active', true)
    .limit(500);

  if (error) throw new Error(`compliance-pings fetch: ${error.message}`);

  const out: ReminderMatch[] = [];
  for (const t of data ?? []) {
    if (!t.email) continue;
    const docs: Array<{ type: ComplianceDocType; expiry: string | null }> = [
      { type: 'passport',        expiry: t.passport_expiry as string | null },
      { type: 'drivers_licence', expiry: t.drivers_licence_expiry as string | null },
      { type: 'wwcc',            expiry: t.wwcc_expiry as string | null },
      { type: 'visa',            expiry: t.visa_expiry as string | null },
    ];
    for (const { type, expiry } of docs) {
      if (!expiry) continue;
      const days = daysUntil(expiry);
      if (days < 0 || days > COMPLIANCE_THRESHOLD_DAYS) continue;
      const draft = buildComplianceEmail(t.working_name as string, type, expiry, days);
      out.push({
        idempotencyKey: `compliance_${t.id}_${type}_${expiry}`,
        actionType: 'compliance_renewal_ping',
        summary: `${t.working_name} — ${COMPLIANCE_DOC_LABELS[type]} expires in ${days}d`,
        draftContent: {
          to: [t.email], subject: draft.subject, body: draft.body,
          talent_id: t.id, doc_type: type, expiry_date: expiry, days_until_expiry: days,
        },
        bookingId: null,
        confidence: 95,
        uncertaintySources: days <= 7
          ? ['Document expires within 7 days — consider phoning instead of emailing']
          : [],
      });
    }
  }
  return out;
}

// ============================================================
// Rule: business renewals (agency-side, ≤30d)
// ============================================================

async function businessRenewalMatches(supabase: SupabaseClient): Promise<ReminderMatch[]> {
  const agency = getAgencyConfig();
  const agencyEmail = agency.email ?? 'info@example.com'; // HARDCODED-OK: dev fallback only — prod always has agency.email

  const { data, error } = await supabase
    .from('atelier_business_renewals')
    .select('id, type, label, expires_at, notes')
    .eq('is_archived', false);

  if (error) throw new Error(`business-renewals fetch: ${error.message}`);

  const out: ReminderMatch[] = [];
  for (const r of data ?? []) {
    const expiresAt = r.expires_at as string;
    if (!expiresAt) continue;
    const days = daysUntil(expiresAt);
    if (days < 0 || days > COMPLIANCE_THRESHOLD_DAYS) continue;

    const expiryReadable = new Date(expiresAt).toLocaleDateString('en-AU', {
      day: 'numeric', month: 'long', year: 'numeric',
    });
    const subject = `Reminder: ${r.label} expires ${expiryReadable}`;
    const body = `Hi ${agency.ownerName.split(' ')[0]},

Quick reminder — ${r.label} is due on ${expiryReadable} (${days} day${days === 1 ? '' : 's'} from now).

${r.notes ? `Notes on file: ${r.notes}\n\n` : ''}Action this before the expiry to avoid lapsing.

— Atelier`;

    out.push({
      idempotencyKey: `business_renewal_${r.id}_${expiresAt}`,
      actionType: 'business_renewal_reminder',
      summary: `${r.label} expires in ${days}d`,
      draftContent: {
        to: [agencyEmail], subject, body,
        renewal_id: r.id, renewal_type: r.type,
        expiry_date: expiresAt, days_until_expiry: days,
      },
      bookingId: null,
      confidence: 100,
      onQueued: async () => {
        await supabase
          .from('atelier_business_renewals')
          .update({ reminder_queued_at: new Date().toISOString() })
          .eq('id', r.id as string);
      },
    });
  }
  return out;
}

// ============================================================
// The full rule set
// ============================================================

export const REMINDER_RULES: ReminderRule[] = [
  { id: 'quote-chase',     label: 'Quote chase',                                 match: quoteChaseMatches },
  { id: 'post-shoot',      label: 'Post-shoot client chase',                     match: postShootChaseMatches },
  { id: 'gallery-ping',    label: 'Gallery share request (talent + crew)',       match: galleryPingMatches },
  { id: 'compliance-ping', label: 'Talent compliance document expiry',           match: compliancePingMatches },
  { id: 'business-renewal',label: 'Agency business renewal',                     match: businessRenewalMatches },
];
