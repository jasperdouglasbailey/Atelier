/**
 * Portal data — talent + crew self-service queries.
 *
 * IMPORTANT: until RLS lockdown ships, these helpers MUST scope every
 * query by the talent_id / crew_id linked to the caller's app_user
 * row. The functions here all take an explicit entity id (no implicit
 * "current user" lookup) so callers can't accidentally leak data.
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

/** Talent profile + bookings + day-rate + super status. */
export async function getTalentPortalData(talentId: string): Promise<{
  talent: Talent | null;
  bookings: PortalBookingRow[];
} | null> {
  const supabase = await createClient();

  const [talentResp, bookingsResp] = await Promise.all([
    supabase.from('atelier_talent').select('*').eq('id', talentId).maybeSingle(),
    supabase
      .from('atelier_booking_talent')
      .select('day_rate, usage_fee, confirmed, booking:atelier_bookings!inner(id, booking_ref, title, state, shoot_date_notes, tier)')
      .eq('talent_id', talentId)
      .order('created_at', { ascending: false }),
  ]);

  if (talentResp.error) {
    reportDataError('[portal] talent', talentResp.error);
    return null;
  }
  if (bookingsResp.error) {
    reportDataError('[portal] talent bookings', bookingsResp.error);
    return null;
  }

  type Row = {
    day_rate: number | null;
    usage_fee: number | null;
    confirmed: boolean;
    booking: {
      id: string;
      booking_ref: string | null;
      title: string;
      state: BookingState;
      shoot_date_notes: string | null;
      tier: string;
    } | null;
  };

  const bookings = ((bookingsResp.data ?? []) as unknown as Row[])
    .filter((r): r is Row & { booking: NonNullable<Row['booking']> } => r.booking != null)
    .map((r) => ({
      bookingId: r.booking.id,
      bookingRef: r.booking.booking_ref,
      title: r.booking.title,
      state: r.booking.state,
      shootDateNotes: r.booking.shoot_date_notes,
      tier: r.booking.tier,
      dayRate: r.day_rate,
      usageFee: r.usage_fee,
      confirmed: r.confirmed,
    }));

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

  const [crewResp, bookingsResp] = await Promise.all([
    supabase.from('atelier_crew').select('*').eq('id', crewId).maybeSingle(),
    supabase
      .from('atelier_booking_crew')
      .select('day_rate, role_on_booking, confirmed, booking:atelier_bookings!inner(id, booking_ref, title, state, shoot_date_notes, tier)')
      .eq('crew_id', crewId)
      .order('created_at', { ascending: false }),
  ]);

  if (crewResp.error) {
    reportDataError('[portal] crew', crewResp.error);
    return null;
  }
  if (bookingsResp.error) {
    reportDataError('[portal] crew bookings', bookingsResp.error);
    return null;
  }

  type Row = {
    day_rate: number | null;
    role_on_booking: string | null;
    confirmed: boolean;
    booking: {
      id: string;
      booking_ref: string | null;
      title: string;
      state: BookingState;
      shoot_date_notes: string | null;
      tier: string;
    } | null;
  };

  const bookings = ((bookingsResp.data ?? []) as unknown as Row[])
    .filter((r): r is Row & { booking: NonNullable<Row['booking']> } => r.booking != null)
    .map((r) => ({
      bookingId: r.booking.id,
      bookingRef: r.booking.booking_ref,
      title: r.booking.title,
      state: r.booking.state,
      shootDateNotes: r.booking.shoot_date_notes,
      tier: r.booking.tier,
      dayRate: r.day_rate,
      usageFee: null,
      confirmed: r.confirmed,
      roleOnBooking: r.role_on_booking,
    }));

  return {
    crew: crewResp.data as Crew | null,
    bookings,
  };
}

// Reference imports just for type completeness; not exported above
export type { Booking };
