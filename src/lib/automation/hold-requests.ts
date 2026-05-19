/**
 * Crew hold-request automation.
 *
 * Doctrine:
 *   "Comms agent auto-sends crew hold requests when ALL of:
 *    (a) crew is preferred-core tier, (b) template unchanged,
 *    (c) shoot >48h from now. Any fail = drafts to Jasper for approval."
 *
 * Until the LLM-backed Comms agent lands, this is pure rules + templated
 * email drafts. Everything still goes through the approval queue per the
 * non-negotiable strict-approval default — auto-approvable items are
 * just flagged with higher confidence so Jasper can scan/skim them.
 */

import { createClient } from '@/lib/supabase/server';
import { createApproval } from '@/lib/data/approvals';
import { logAudit } from '@/lib/utils/audit';
import { emitEvent } from '@/lib/utils/events';
import { formatDate } from '@/lib/utils/format';
import { getAgencyConfig } from '@/lib/utils/agency-config';
import { composeCrewEmail } from '@/lib/utils/crew-email';

const HOURS_48 = 48 * 60 * 60 * 1000;

export type HoldRequestProposal = {
  bookingCrewId: string;
  crewId: string;
  crewName: string;
  crewTier: string;
  role: string | null;
  dayRate: number | null;
  autoApprovable: boolean;
  reasonsBlocked: string[];
  email: { to: string | null; subject: string; body: string };
  idempotencyKey: string;
};

type BookingForHold = {
  id: string;
  booking_ref: string | null;
  title: string;
  state: string;
  shoot_dates: string | null;
  shoot_location: string | null;
  call_time: string | null;
  wrap_time: string | null;
  client?: { company: string | null; name: string } | null;
};

/**
 * Format "8:00am" / "6:00pm" from a Postgres TIME string like "08:00:00".
 * Returns null for invalid / empty input. AU-conventional lowercase am/pm.
 */
function formatTimeOfDay(input: string | null | undefined): string | null {
  if (!input) return null;
  const m = input.match(/^(\d{1,2}):(\d{2})/);
  if (!m) return null;
  const h24 = parseInt(m[1], 10);
  const min = parseInt(m[2], 10);
  if (isNaN(h24) || isNaN(min) || h24 > 23 || min > 59) return null;
  const period = h24 >= 12 ? 'pm' : 'am';
  const h12 = h24 % 12 === 0 ? 12 : h24 % 12;
  return `${h12}:${min.toString().padStart(2, '0')}${period}`;
}

function formatTiming(call: string | null | undefined, wrap: string | null | undefined): string | null {
  const c = formatTimeOfDay(call);
  const w = formatTimeOfDay(wrap);
  if (c && w) return `${c} – ${w}`;
  if (c) return `${c} – TBC`;
  if (w) return `TBC – ${w}`;
  return null;
}

function humaniseRole(role: string | null | undefined): string | null {
  if (!role) return null;
  const cleaned = role.replace(/_/g, ' ').trim();
  if (!cleaned) return null;
  // Sentence case: capitalise first letter only. Most roles are
  // "digital operator", "hmua" (we'll leave acronyms alone).
  return cleaned.charAt(0).toUpperCase() + cleaned.slice(1);
}

function parseRangeStart(input: string | null | undefined): Date | null {
  if (!input) return null;
  const m = input.match(/^[\[(](\d{4}-\d{2}-\d{2}),/);
  if (!m) return null;
  return new Date(m[1] + 'T09:00:00+10:00'); // Assume Sydney 9am call
}

function formatShootDates(input: string | null | undefined): string {
  if (!input) return 'TBD';
  const m = input.match(/^[\[(](\d{4}-\d{2}-\d{2})?,(\d{4}-\d{2}-\d{2})?[\])]$/);
  if (!m || !m[1]) return 'TBD';
  const start = m[1];
  // Postgres ranges have exclusive end; subtract a day for human display.
  if (m[2]) {
    const end = new Date(m[2] + 'T00:00:00Z');
    end.setUTCDate(end.getUTCDate() - 1);
    const endStr = end.toISOString().slice(0, 10);
    return endStr === start
      ? formatDate(start)
      : `${formatDate(start)} – ${formatDate(endStr)}`;
  }
  return formatDate(start);
}

function buildEmail(args: {
  crewName: string;
  client: string | null;
  dates: string | null;
  artists: string[];
  role: string | null;
  dayRate: number | null;
  timing: string | null;
  location: string | null;
}): { subject: string; body: string } {
  const firstName = args.crewName.split(' ')[0] || 'there';
  const agency = getAgencyConfig();

  // When there's actually no client on the booking, pass null so the
  // emoji-row builder skips the row entirely — better than papering over
  // missing data with the agency name as a placeholder.
  const clientLabel = args.client && args.client.trim().length > 0 ? args.client : null;

  return composeCrewEmail({
    mode: 'hold',
    recipientFirstName: firstName,
    artists: args.artists,
    clientLabel,
    role: humaniseRole(args.role),
    rates: {
      dayFee: args.dayRate,
      // Crew labour is super-bearing by doctrine. When the comms agent
      // eventually drafts holds for non-super-bearing roles, this flag
      // will be conditional — for now, hold-requests only fires on
      // crew_labour-style rows.
      dayFeeSuperBearing: true,
      travel: null,    // pre-hold: travel not yet pre-loaded
      overtime: null,  // pre-hold: OT not yet pre-loaded
    },
    dates: args.dates,
    timing: args.timing,
    location: args.location,
    agencyOwnerName: agency.ownerName.split(' ')[0] || agency.ownerName,
  });
}

/**
 * Builds proposals (no DB writes). Pure function — easier to test, easier
 * to preview in the UI before committing.
 */
export async function buildHoldRequestProposals(bookingId: string): Promise<{
  booking: BookingForHold | null;
  proposals: HoldRequestProposal[];
}> {
  const supabase = await createClient();

  const { data: bookingRow } = await supabase
    .from('atelier_bookings')
    .select('id, booking_ref, title, state, shoot_dates, shoot_location, call_time, wrap_time, client:atelier_clients!atelier_bookings_client_id_fkey(name, company)')
    .eq('id', bookingId)
    .maybeSingle();

  if (!bookingRow) return { booking: null, proposals: [] };
  const booking = bookingRow as unknown as BookingForHold;

  // Pull artist names so the email's "🎤 Assisting:" row can name who the
  // crew member would be working with. Joined separately from the booking
  // query because PostgREST handles the M2M cleaner this way.
  const { data: talentRows } = await supabase
    .from('atelier_booking_talent')
    .select('talent:atelier_talent!atelier_booking_talent_talent_id_fkey(working_name, created_at)')
    .eq('booking_id', bookingId)
    .order('created_at', { ascending: true });

  type TalentRow = { talent: { working_name: string | null } | { working_name: string | null }[] | null };
  const artists = ((talentRows ?? []) as TalentRow[])
    .map((row) => {
      const t = Array.isArray(row.talent) ? row.talent[0] : row.talent;
      return t?.working_name ?? null;
    })
    .filter((n): n is string => !!n && n.trim().length > 0);

  const { data: crewRows } = await supabase
    .from('atelier_booking_crew')
    .select('id, crew_id, role_on_booking, day_rate, status, crew:atelier_crew(name, email, tier)')
    .eq('booking_id', bookingId)
    .eq('status', 'hold_requested');

  if (!crewRows || crewRows.length === 0) {
    return { booking, proposals: [] };
  }

  const shootStart = parseRangeStart(booking.shoot_dates);
  const now = Date.now();
  const moreThan48h = shootStart ? shootStart.getTime() - now > HOURS_48 : false;
  const dates = formatShootDates(booking.shoot_dates);
  // Client display: company preferred, falls back to contact name. Null
  // when there's no client linked — the email composer skips the row
  // rather than show a misleading agency-name stand-in.
  const clientLabel = booking.client?.company || booking.client?.name || null;
  const timing = formatTiming(booking.call_time, booking.wrap_time);

  return {
    booking,
    proposals: (crewRows as unknown[]).map((row) => {
      const r = row as Record<string, unknown>;
      const crew = r.crew as Record<string, unknown> | null;
      const crewName = (crew?.name as string) ?? 'Unknown';
      const crewTier = (crew?.tier as string) ?? 'regular_freelance';
      const crewEmail = (crew?.email as string) ?? null;
      const role = r.role_on_booking as string | null;
      const dayRate = r.day_rate as number | null;

      const reasonsBlocked: string[] = [];
      if (crewTier !== 'preferred_core') reasonsBlocked.push(`tier=${crewTier} (not preferred_core)`);
      if (!moreThan48h) reasonsBlocked.push('shoot is <48h away (or no shoot date set)');
      if (booking.state !== 'quote_sent') reasonsBlocked.push(`booking state=${booking.state} (not quote_sent)`);

      const autoApprovable = reasonsBlocked.length === 0;

      const email = buildEmail({
        crewName,
        client: clientLabel,
        dates: dates === 'TBD' ? null : dates,
        artists,
        role,
        dayRate,
        timing,
        location: booking.shoot_location,
      });

      return {
        bookingCrewId: r.id as string,
        crewId: r.crew_id as string,
        crewName,
        crewTier,
        role,
        dayRate,
        autoApprovable,
        reasonsBlocked,
        email: { to: crewEmail, ...email },
        idempotencyKey: `crew_hold_request:${bookingId}:${r.crew_id}`,
      };
    }),
  };
}

/**
 * Materialises the proposals as `atelier_approvals` rows. Idempotent: a
 * unique idempotency_key per (booking, crew) prevents duplicate drafts.
 * Returns the count of new rows created.
 */
export async function proposeHoldRequests(bookingId: string): Promise<{
  created: number;
  skipped: number;
  reason?: string;
}> {
  const { booking, proposals } = await buildHoldRequestProposals(bookingId);
  if (!booking) return { created: 0, skipped: 0, reason: 'booking_not_found' };
  if (proposals.length === 0) return { created: 0, skipped: 0, reason: 'no_pending_holds' };

  let created = 0;
  let skipped = 0;

  // Doctrine: agents that recommend booking decisions should cite 1-3
  // prior bookings. Pull each crew member's last 3 confirmed bookings so
  // Jasper sees "we've used Mason on AJE-2024, AJE-2023, …" context when
  // reviewing the approval. The precedent_refs land on the approval row
  // and surface in the inbox UI.
  const supabase = await createClient();
  const crewIds = proposals.map((p) => p.crewId);
  const precedentMap = new Map<string, string[]>();
  if (crewIds.length > 0) {
    const { data: priorBookings } = await supabase
      .from('atelier_booking_crew')
      .select('crew_id, status, booking:atelier_bookings(booking_ref, created_at)')
      .in('crew_id', crewIds)
      .eq('status', 'confirmed')
      .order('created_at', { ascending: false })
      .limit(50);
    for (const row of priorBookings ?? []) {
      const r = row as unknown as {
        crew_id: string;
        booking: { booking_ref: string | null } | null;
      };
      const ref = r.booking?.booking_ref;
      if (!ref) continue;
      const list = precedentMap.get(r.crew_id) ?? [];
      if (list.length < 3) list.push(ref);
      precedentMap.set(r.crew_id, list);
    }
  }

  // Idempotency: pass the key directly into the insert so two concurrent
  // calls collide on the unique constraint atomically. The previous
  // "check-then-update" pattern had a TOCTOU race window.
  for (const p of proposals) {
    const result = await createApproval({
      agent: 'comms',
      action_type: 'crew_hold_request',
      booking_id: bookingId,
      // Phrased as outbound — Saunders is REQUESTING the hold from the crew
      // member. Past wording ("Hold request: X") was ambiguous (read as if
      // the crew member was requesting a hold from us).
      summary: `Send hold request to ${p.crewName}${p.role ? ' (' + p.role.replace(/_/g, ' ') + ')' : ''} — ${booking.booking_ref ?? booking.title}`,
      draft_content: {
        crew_id: p.crewId,
        crew_name: p.crewName,
        crew_tier: p.crewTier,
        role: p.role,
        day_rate: p.dayRate,
        auto_approvable: p.autoApprovable,
        reasons_blocked: p.reasonsBlocked,
        email: p.email,
      },
      confidence: p.autoApprovable ? 95 : 70,
      uncertainty_sources: p.reasonsBlocked,
      precedent_refs: precedentMap.get(p.crewId) ?? [],
      idempotency_key: p.idempotencyKey,
    });

    if (result.duplicate) {
      skipped++;
    } else if (result.approval) {
      created++;
    }
  }

  await emitEvent('crew_holds.proposed', {
    booking_id: bookingId,
    created,
    skipped,
    total_pending: proposals.length,
  }, { bookingId });

  await logAudit({
    userId: 'system',
    action: 'propose_crew_holds',
    tableName: 'atelier_approvals',
    recordId: bookingId,
    newValue: { created, skipped, total: proposals.length },
  });

  return { created, skipped };
}
