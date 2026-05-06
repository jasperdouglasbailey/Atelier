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
import { formatCurrency, formatDate } from '@/lib/utils/format';

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
  client?: { company: string | null; name: string } | null;
};

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
  bookingRef: string | null;
  client: string;
  dates: string;
  role: string | null;
  dayRate: number | null;
  location: string | null;
}): { subject: string; body: string } {
  const firstName = args.crewName.split(' ')[0] || 'there';
  const subject = `Pencil hold — ${args.bookingRef ?? args.client} ${args.dates}`;
  const role = args.role ? args.role.replace(/_/g, ' ') : 'crew';
  const rate = args.dayRate ? `${formatCurrency(args.dayRate, 'AUD')}/day` : 'rate TBD';
  const location = args.location ?? 'location TBC';

  const body = [
    `Hi ${firstName},`,
    '',
    `Putting this on your radar — pencil hold for ${args.bookingRef ?? args.client} (${args.client}) on ${args.dates}.`,
    '',
    `Role: ${role}`,
    `Day rate: ${rate}`,
    `Location: ${location}`,
    '',
    `Let me know if those dates work or if there's anything pencilled in we need to work around. No commitment yet — this is just a soft hold.`,
    '',
    '— Jasper',
  ].join('\n');

  return { subject, body };
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
    .select('id, booking_ref, title, state, shoot_dates, shoot_location, client:atelier_clients!atelier_bookings_client_id_fkey(name, company)')
    .eq('id', bookingId)
    .maybeSingle();

  if (!bookingRow) return { booking: null, proposals: [] };
  const booking = bookingRow as unknown as BookingForHold;

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
  const clientLabel = booking.client?.company || booking.client?.name || 'Saunders & Co';

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
        bookingRef: booking.booking_ref,
        client: clientLabel,
        dates,
        role,
        dayRate,
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
