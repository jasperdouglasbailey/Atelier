/**
 * Portal data — talent + crew self-service queries.
 *
 * Routes through the column-restricted `atelier_bookings_portal` view
 * (migration 0021). The view exposes only the safe booking fields a
 * talent or crew member should see — never client_id, grand_total,
 * agency_notes, brief_raw_text, or any financial totals.
 *
 * The view's WHERE clause enforces auth (is_owner_or_partner OR
 * attached as talent OR attached as crew), so even if a portal user
 * hits the Supabase REST API directly with `select=*`, they only get
 * rows they're attached to and only the whitelisted columns.
 *
 * Day rate / usage fee / role come from atelier_booking_talent and
 * atelier_booking_crew respectively (talent_self_assignments +
 * crew_self_assignments policies). Those tables don't expose anything
 * a talent/crew member shouldn't see about themselves.
 */

import { createClient } from '@/lib/supabase/server';
import { createServiceClient } from '@/lib/supabase/service';
import { reportDataError } from '@/lib/utils/data-errors';
import type { Booking, Talent, Crew, CrewUnavailability, TalentUnavailability, BookingState } from '@/lib/types/database';

export type PortalBookingRow = {
  bookingId: string;
  bookingRef: string | null;
  title: string;
  state: BookingState;
  /**
   * Postgres daterange literal — e.g. `[2026-05-16,2026-05-18)`.
   * The portal view exposes this (migration 0021); we just hadn't been
   * surfacing it. Use `formatShootDates()` from `lib/utils/format.ts` to
   * render — it handles the exclusive end-bound correctly.
   */
  shootDates: string | null;
  /** Free-text supplement to shootDates (e.g. "Mon only", "TBC pending location"). */
  shootDateNotes: string | null;
  shootLocation: string | null;
  tier: string;
  dayRate: number | null;
  usageFee: number | null;
  confirmed: boolean;
};

/** A fee line the artist is entitled to see — own fees + shoot equipment. */
export type PortalFeeLine = {
  id: string;
  lineType: string;
  description: string;
  quantity: number;
  unitPrice: number;
  subtotal: number;
};

export type TalentPortalBookingRow = PortalBookingRow & {
  bookingTalentId: string;
  status: string;
  rateAccepted: boolean;
  briefAcknowledgedAt: string | null;
  /** Artist's own fee lines + shoot equipment lines — so they know their budget. */
  feeLines: PortalFeeLine[];
};

export type CrewPortalBookingRow = PortalBookingRow & {
  bookingCrewId: string;
  roleOnBooking: string | null;
  status: string;
};

/** Shared team member visible on a portal call sheet — names + roles only, no rates. */
export type PortalTeamMember = {
  name: string;
  role: string;
  type: 'talent' | 'crew';
  mobile: string | null;
};

/** Call-sheet details for one upcoming booking, visible in both portals. */
export type PortalCallSheet = {
  bookingId: string;
  bookingRef: string | null;
  title: string;
  shootLocation: string | null;
  shootDateNotes: string | null;
  team: PortalTeamMember[];
};

// ─── talent portal ────────────────────────────────────────────────────────────

export async function getTalentPortalData(talentId: string): Promise<{
  talent: Talent | null;
  bookings: TalentPortalBookingRow[];
  unavailability: TalentUnavailability[];
} | null> {
  const supabase = await createClient();

  const [talentResp, assignmentsResp, unavailResp] = await Promise.all([
    supabase.from('atelier_talent').select('*').eq('id', talentId).maybeSingle(),
    supabase
      .from('atelier_booking_talent')
      // The actual column is `confirmed_at timestamptz` — we derive the boolean
      // `confirmed` flag from `confirmed_at !== null` in JS. Earlier this column
      // was selected as `confirmed` which doesn't exist; Postgres returned
      // "column does not exist" and the whole portal payload errored to null,
      // surfacing as "Could not load your profile."
      .select('id, booking_id, day_rate, usage_fee, confirmed_at, status, rate_accepted, brief_acknowledged_at, created_at')
      .eq('talent_id', talentId)
      .order('created_at', { ascending: false }),
    supabase
      .from('atelier_talent_unavailability')
      .select('*')
      .eq('talent_id', talentId)
      .order('date_from', { ascending: true }),
  ]);

  if (talentResp.error) { reportDataError('[portal] talent', talentResp.error); return null; }
  if (assignmentsResp.error) { reportDataError('[portal] talent assignments', assignmentsResp.error); return null; }

  const assignments = assignmentsResp.data ?? [];
  const bookingIds = assignments.map((a) => a.booking_id as string);

  const bookingsResp = bookingIds.length === 0
    ? { data: [], error: null as null | { message: string } }
    : await supabase
        .from('atelier_bookings_portal')
        .select('id, booking_ref, title, tier, state, shoot_dates, shoot_date_notes, shoot_location')
        .in('id', bookingIds);

  if (bookingsResp.error) { reportDataError('[portal] talent bookings', bookingsResp.error); return null; }

  type ViewRow = { id: string; booking_ref: string | null; title: string; tier: string; state: BookingState; shoot_dates: string | null; shoot_date_notes: string | null; shoot_location: string | null };
  const bookingMap = new Map(((bookingsResp.data ?? []) as ViewRow[]).map((b) => [b.id, b]));

  // Fetch fee lines the artist is entitled to see:
  // (a) lines tagged to this talent, and (b) equipment/production lines for the shoot
  const EQUIPMENT_LINE_TYPES = ['equipment_rental', 'studio_hire', 'wardrobe', 'props', 'crew_equipment'];
  const feeLinesResp = bookingIds.length === 0
    ? { data: [], error: null as null | { message: string } }
    : await supabase
        .from('atelier_fee_lines')
        .select('id, booking_id, line_type, description, quantity, unit_price, subtotal, talent_id')
        .in('booking_id', bookingIds)
        .or(`talent_id.eq.${talentId},line_type.in.(${EQUIPMENT_LINE_TYPES.join(',')})`);

  type FeeRow = { id: string; booking_id: string; line_type: string; description: string; quantity: number; unit_price: number; subtotal: number; talent_id: string | null };
  const feeLinesByBooking = new Map<string, PortalFeeLine[]>();
  for (const fl of (feeLinesResp.data ?? []) as FeeRow[]) {
    const list = feeLinesByBooking.get(fl.booking_id) ?? [];
    list.push({ id: fl.id, lineType: fl.line_type, description: fl.description, quantity: fl.quantity, unitPrice: fl.unit_price, subtotal: fl.subtotal });
    feeLinesByBooking.set(fl.booking_id, list);
  }

  const bookings: TalentPortalBookingRow[] = assignments
    .map((a) => {
      const b = bookingMap.get(a.booking_id as string);
      if (!b) return null;
      return {
        bookingId: b.id,
        bookingTalentId: a.id as string,
        bookingRef: b.booking_ref,
        title: b.title,
        state: b.state,
        shootDates: b.shoot_dates,
        shootDateNotes: b.shoot_date_notes,
        shootLocation: b.shoot_location,
        tier: b.tier,
        dayRate: a.day_rate as number | null,
        usageFee: a.usage_fee as number | null,
        confirmed: Boolean(a.confirmed_at),
        status: (a.status as string) ?? 'hold_requested',
        rateAccepted: (a.rate_accepted as boolean) ?? false,
        briefAcknowledgedAt: a.brief_acknowledged_at as string | null,
        feeLines: feeLinesByBooking.get(b.id) ?? [],
      };
    })
    .filter((r): r is TalentPortalBookingRow => r !== null);

  return {
    talent: talentResp.data as Talent | null,
    bookings,
    unavailability: (unavailResp.data ?? []) as TalentUnavailability[],
  };
}

// ─── crew portal ──────────────────────────────────────────────────────────────

export async function getCrewPortalData(crewId: string): Promise<{
  crew: Crew | null;
  bookings: CrewPortalBookingRow[];
  unavailability: CrewUnavailability[];
} | null> {
  const supabase = await createClient();

  const [crewResp, assignmentsResp, unavailResp] = await Promise.all([
    supabase.from('atelier_crew').select('*').eq('id', crewId).maybeSingle(),
    supabase
      .from('atelier_booking_crew')
      // See talent-side comment — column is confirmed_at, not confirmed.
      .select('id, booking_id, day_rate, role_on_booking, confirmed_at, status, created_at')
      .eq('crew_id', crewId)
      .order('created_at', { ascending: false }),
    supabase
      .from('atelier_crew_unavailability')
      .select('*')
      .eq('crew_id', crewId)
      .order('date_from', { ascending: true }),
  ]);

  if (crewResp.error) { reportDataError('[portal] crew', crewResp.error); return null; }
  if (assignmentsResp.error) { reportDataError('[portal] crew assignments', assignmentsResp.error); return null; }

  const assignments = assignmentsResp.data ?? [];
  const bookingIds = assignments.map((a) => a.booking_id as string);

  const bookingsResp = bookingIds.length === 0
    ? { data: [], error: null as null | { message: string } }
    : await supabase
        .from('atelier_bookings_portal')
        .select('id, booking_ref, title, tier, state, shoot_dates, shoot_date_notes, shoot_location')
        .in('id', bookingIds);

  if (bookingsResp.error) { reportDataError('[portal] crew bookings', bookingsResp.error); return null; }

  type ViewRow = { id: string; booking_ref: string | null; title: string; tier: string; state: BookingState; shoot_dates: string | null; shoot_date_notes: string | null; shoot_location: string | null };
  const bookingMap = new Map(((bookingsResp.data ?? []) as ViewRow[]).map((b) => [b.id, b]));

  const bookings: CrewPortalBookingRow[] = assignments
    .map((a) => {
      const b = bookingMap.get(a.booking_id as string);
      if (!b) return null;
      return {
        bookingId: b.id,
        bookingCrewId: a.id as string,
        bookingRef: b.booking_ref,
        title: b.title,
        state: b.state,
        shootDates: b.shoot_dates,
        shootDateNotes: b.shoot_date_notes,
        shootLocation: b.shoot_location,
        tier: b.tier,
        dayRate: a.day_rate as number | null,
        usageFee: null as number | null,
        confirmed: Boolean(a.confirmed_at),
        roleOnBooking: a.role_on_booking as string | null,
        status: (a.status as string) ?? 'hold_requested',
      };
    })
    .filter((r): r is CrewPortalBookingRow => r !== null);

  return {
    crew: crewResp.data as Crew | null,
    bookings,
    unavailability: (unavailResp.data ?? []) as CrewUnavailability[],
  };
}

// ─── call sheet ───────────────────────────────────────────────────────────────

const CALL_SHEET_STATES: BookingState[] = [
  'artists_crew_held', 'quote_confirmed', 'pre_production', 'shoot_live', 'morning_after_check',
];

/**
 * Returns call-sheet details for upcoming bookings visible to a portal user.
 *
 * Uses the service client to read the booking + team data (bypassing the
 * portal user's column-restricted view), then **verifies attachment** by
 * looking up the viewer's own assignment rows. Only bookings the viewer
 * is actually attached to are returned — so even if a caller passed in a
 * `bookingIds` list it shouldn't have access to, the response is filtered.
 *
 * Returns team names + roles + mobiles only. No rates, no client details.
 */
export async function getPortalCallSheets(
  viewerType: 'talent' | 'crew',
  viewerId: string,
  bookingIds: string[],
): Promise<PortalCallSheet[]> {
  if (bookingIds.length === 0) return [];
  if (!viewerId) return [];

  const supabase = createServiceClient();

  // 1) Verify attachment: only return bookings where the viewer is
  //    actually on the talent or crew roster.
  const attachmentTable = viewerType === 'talent' ? 'atelier_booking_talent' : 'atelier_booking_crew';
  const attachmentIdCol = viewerType === 'talent' ? 'talent_id' : 'crew_id';
  const { data: attached, error: attachErr } = await supabase
    .from(attachmentTable)
    .select('booking_id')
    .eq(attachmentIdCol, viewerId)
    .in('booking_id', bookingIds);
  if (attachErr) {
    reportDataError('[portal] call-sheet attachment check', attachErr);
    return [];
  }
  const attachedIds = Array.from(new Set((attached ?? []).map((r) => r.booking_id as string)));
  if (attachedIds.length === 0) return [];

  // 2) Now look up the bookings — restricted to those the viewer is
  //    attached to AND in a state where a call sheet is meaningful.
  const { data: bookings } = await supabase
    .from('atelier_bookings')
    .select('id, booking_ref, title, shoot_location, shoot_date_notes, state')
    .in('id', attachedIds)
    .in('state', CALL_SHEET_STATES);

  if (!bookings || bookings.length === 0) return [];

  const activeIds = bookings.map((b) => b.id);

  // Fetch talent and crew in parallel. Filter to those confirmed on the
  // booking (confirmed_at is set) — exclude pending holds from call sheets.
  const [talentRows, crewRows] = await Promise.all([
    supabase
      .from('atelier_booking_talent')
      .select('booking_id, confirmed_at, talent:atelier_talent!atelier_booking_talent_talent_id_fkey(working_name, mobile)')
      .in('booking_id', activeIds)
      .not('confirmed_at', 'is', null),
    supabase
      .from('atelier_booking_crew')
      .select('booking_id, role_on_booking, confirmed_at, crew:atelier_crew!atelier_booking_crew_crew_id_fkey(name, mobile)')
      .in('booking_id', activeIds)
      .not('confirmed_at', 'is', null),
  ]);

  type TRow = { booking_id: string; confirmed_at: string | null; talent: { working_name: string; mobile: string | null } | { working_name: string; mobile: string | null }[] | null };
  type CRow = { booking_id: string; role_on_booking: string | null; confirmed_at: string | null; crew: { name: string; mobile: string | null } | { name: string; mobile: string | null }[] | null };

  const talentByBooking = new Map<string, PortalTeamMember[]>();
  const crewByBooking = new Map<string, PortalTeamMember[]>();

  for (const row of (talentRows.data ?? []) as unknown as TRow[]) {
    const t = Array.isArray(row.talent) ? row.talent[0] : row.talent;
    if (!t) continue;
    const list = talentByBooking.get(row.booking_id) ?? [];
    list.push({ name: t.working_name, role: 'Talent', type: 'talent', mobile: t.mobile });
    talentByBooking.set(row.booking_id, list);
  }

  for (const row of (crewRows.data ?? []) as unknown as CRow[]) {
    const c = Array.isArray(row.crew) ? row.crew[0] : row.crew;
    if (!c) continue;
    const list = crewByBooking.get(row.booking_id) ?? [];
    list.push({ name: c.name, role: row.role_on_booking ?? 'Crew', type: 'crew', mobile: c.mobile });
    crewByBooking.set(row.booking_id, list);
  }

  return bookings.map((b) => ({
    bookingId: b.id,
    bookingRef: b.booking_ref as string | null,
    title: b.title as string,
    shootLocation: b.shoot_location as string | null,
    shootDateNotes: b.shoot_date_notes as string | null,
    team: [
      ...(talentByBooking.get(b.id) ?? []),
      ...(crewByBooking.get(b.id) ?? []),
    ],
  }));
}

// ─── crew unavailability (admin-side lookup) ──────────────────────────────────

/**
 * Returns a map of crew_id → blocked date ranges for a given date span.
 * Used by the booking-team picker to surface conflicts from self-reported blocks.
 */
export async function getCrewUnavailabilityForRange(
  startDate: string,
  endDate: string,
): Promise<Map<string, Array<{ dateFrom: string; dateTo: string; reason: string | null }>>> {
  const supabase = createServiceClient();
  const { data } = await supabase
    .from('atelier_crew_unavailability')
    .select('crew_id, date_from, date_to, reason')
    .lte('date_from', endDate)
    .gte('date_to', startDate);

  const result = new Map<string, Array<{ dateFrom: string; dateTo: string; reason: string | null }>>();
  for (const row of data ?? []) {
    const list = result.get(row.crew_id as string) ?? [];
    list.push({ dateFrom: row.date_from as string, dateTo: row.date_to as string, reason: row.reason as string | null });
    result.set(row.crew_id as string, list);
  }
  return result;
}

// ─── talent unavailability (admin-side lookup) ────────────────────────────────

export async function getTalentUnavailabilityForRange(
  startDate: string,
  endDate: string,
): Promise<Map<string, Array<{ dateFrom: string; dateTo: string; reason: string | null }>>> {
  const supabase = createServiceClient();
  const { data } = await supabase
    .from('atelier_talent_unavailability')
    .select('talent_id, date_from, date_to, reason')
    .lte('date_from', endDate)
    .gte('date_to', startDate);

  const result = new Map<string, Array<{ dateFrom: string; dateTo: string; reason: string | null }>>();
  for (const row of data ?? []) {
    const list = result.get(row.talent_id as string) ?? [];
    list.push({ dateFrom: row.date_from as string, dateTo: row.date_to as string, reason: row.reason as string | null });
    result.set(row.talent_id as string, list);
  }
  return result;
}

// Reference import kept for type completeness
export type { Booking, TalentUnavailability };
