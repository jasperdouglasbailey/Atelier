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
import { reportDataError } from '@/lib/utils/data-errors';
import type { Booking, Talent, Crew, BookingState } from '@/lib/types/database';

export type PortalBookingRow = {
  bookingId: string;
  bookingRef: string | null;
  title: string;
  state: BookingState;
  shootDateNotes: string | null;
  tier: string;
  dayRate: number | null;
  usageFee: number | null;
  confirmed: boolean;
};

/** Talent profile + bookings + day-rate. */
export async function getTalentPortalData(talentId: string): Promise<{
  talent: Talent | null;
  bookings: PortalBookingRow[];
} | null> {
  const supabase = await createClient();

  // Step 1: own profile + own assignment rows (with day_rate / usage_fee).
  const [talentResp, assignmentsResp] = await Promise.all([
    supabase.from('atelier_talent').select('*').eq('id', talentId).maybeSingle(),
    supabase
      .from('atelier_booking_talent')
      .select('booking_id, day_rate, usage_fee, confirmed, created_at')
      .eq('talent_id', talentId)
      .order('created_at', { ascending: false }),
  ]);

  if (talentResp.error) {
    reportDataError('[portal] talent', talentResp.error);
    return null;
  }
  if (assignmentsResp.error) {
    reportDataError('[portal] talent assignments', assignmentsResp.error);
    return null;
  }

  const assignments = assignmentsResp.data ?? [];
  const bookingIds = assignments.map((a) => a.booking_id as string);

  // Step 2: safe booking columns via the portal view. The view's WHERE
  // clause re-filters to bookings this talent is attached to, so even an
  // attacker spoofing booking_ids in step 1 can't widen the result.
  const bookingsResp = bookingIds.length === 0
    ? { data: [], error: null as null | { message: string } }
    : await supabase
        .from('atelier_bookings_portal')
        .select('id, booking_ref, title, tier, state, shoot_date_notes')
        .in('id', bookingIds);

  if (bookingsResp.error) {
    reportDataError('[portal] talent bookings', bookingsResp.error);
    return null;
  }

  type ViewRow = {
    id: string;
    booking_ref: string | null;
    title: string;
    tier: string;
    state: BookingState;
    shoot_date_notes: string | null;
  };
  const bookingMap = new Map(
    ((bookingsResp.data ?? []) as ViewRow[]).map((b) => [b.id, b]),
  );

  const bookings: PortalBookingRow[] = assignments
    .map((a) => {
      const b = bookingMap.get(a.booking_id as string);
      if (!b) return null;
      return {
        bookingId: b.id,
        bookingRef: b.booking_ref,
        title: b.title,
        state: b.state,
        shootDateNotes: b.shoot_date_notes,
        tier: b.tier,
        dayRate: a.day_rate as number | null,
        usageFee: a.usage_fee as number | null,
        confirmed: a.confirmed as boolean,
      };
    })
    .filter((r): r is PortalBookingRow => r !== null);

  return {
    talent: talentResp.data as Talent | null,
    bookings,
  };
}

/** Crew profile + bookings + day rate + role. */
export async function getCrewPortalData(crewId: string): Promise<{
  crew: Crew | null;
  bookings: Array<PortalBookingRow & { roleOnBooking: string | null }>;
} | null> {
  const supabase = await createClient();

  const [crewResp, assignmentsResp] = await Promise.all([
    supabase.from('atelier_crew').select('*').eq('id', crewId).maybeSingle(),
    supabase
      .from('atelier_booking_crew')
      .select('booking_id, day_rate, role_on_booking, confirmed, created_at')
      .eq('crew_id', crewId)
      .order('created_at', { ascending: false }),
  ]);

  if (crewResp.error) {
    reportDataError('[portal] crew', crewResp.error);
    return null;
  }
  if (assignmentsResp.error) {
    reportDataError('[portal] crew assignments', assignmentsResp.error);
    return null;
  }

  const assignments = assignmentsResp.data ?? [];
  const bookingIds = assignments.map((a) => a.booking_id as string);

  const bookingsResp = bookingIds.length === 0
    ? { data: [], error: null as null | { message: string } }
    : await supabase
        .from('atelier_bookings_portal')
        .select('id, booking_ref, title, tier, state, shoot_date_notes')
        .in('id', bookingIds);

  if (bookingsResp.error) {
    reportDataError('[portal] crew bookings', bookingsResp.error);
    return null;
  }

  type ViewRow = {
    id: string;
    booking_ref: string | null;
    title: string;
    tier: string;
    state: BookingState;
    shoot_date_notes: string | null;
  };
  const bookingMap = new Map(
    ((bookingsResp.data ?? []) as ViewRow[]).map((b) => [b.id, b]),
  );

  const bookings = assignments
    .map((a) => {
      const b = bookingMap.get(a.booking_id as string);
      if (!b) return null;
      return {
        bookingId: b.id,
        bookingRef: b.booking_ref,
        title: b.title,
        state: b.state,
        shootDateNotes: b.shoot_date_notes,
        tier: b.tier,
        dayRate: a.day_rate as number | null,
        usageFee: null,
        confirmed: a.confirmed as boolean,
        roleOnBooking: a.role_on_booking as string | null,
      };
    })
    .filter((r): r is NonNullable<typeof r> => r !== null);

  return {
    crew: crewResp.data as Crew | null,
    bookings,
  };
}

// Reference imports just for type completeness; not exported above
export type { Booking };
