/**
 * Agency-side calendar data for a single talent or crew member.
 *
 * Mirrors what the person sees in their own portal calendar
 * (PortalCalendar): all bookings they're on + their self-reported
 * unavailability blockouts.
 *
 * Used on /talent/[id] and /crew/[id] detail pages so the agency can
 * see "what days is X booked or blocked" at a glance, instead of
 * discovering conflicts only at booking time via the CrewDayPicker.
 *
 * Shape matches `CalendarBooking` + `CalendarUnavailability` in
 * PortalCalendar so the component can be reused as-is in read-only
 * mode.
 */

import { createClient } from '@/lib/supabase/server';
import { reportDataError } from '@/lib/utils/data-errors';
import type { CalendarBooking, CalendarUnavailability } from '@/components/portal/PortalCalendar';

export async function getTalentCalendarData(talentId: string): Promise<{
  bookings: CalendarBooking[];
  unavailability: CalendarUnavailability[];
}> {
  const supabase = await createClient();

  const [bookingResp, unavailResp] = await Promise.all([
    supabase
      .from('atelier_booking_talent')
      // confirmed_at is the source-of-truth; confirmed bool is derived from it
      .select('confirmed_at, status, booking:atelier_bookings!atelier_booking_talent_booking_id_fkey(id, booking_ref, title, shoot_dates, state)')
      .eq('talent_id', talentId),
    supabase
      .from('atelier_talent_unavailability')
      .select('id, date_from, date_to, reason')
      .eq('talent_id', talentId)
      .order('date_from', { ascending: false }),
  ]);

  if (bookingResp.error) reportDataError('[person-calendar] talent bookings', bookingResp.error);
  if (unavailResp.error) reportDataError('[person-calendar] talent unavailability', unavailResp.error);

  type Row = {
    confirmed_at: string | null;
    status: string | null;
    booking: { id: string; booking_ref: string | null; title: string; shoot_dates: string | null; state: string } | null;
  };

  const bookings = ((bookingResp.data ?? []) as unknown as Row[])
    .filter((r) => r.booking && r.booking.shoot_dates)
    .map((r) => ({
      bookingId: r.booking!.id,
      bookingRef: r.booking!.booking_ref,
      title: r.booking!.title,
      shootDates: r.booking!.shoot_dates,
      confirmed: Boolean(r.confirmed_at),
      status: r.status ?? 'hold_requested',
    }));

  return {
    bookings,
    unavailability: (unavailResp.data ?? []) as CalendarUnavailability[],
  };
}

export async function getCrewCalendarData(crewId: string): Promise<{
  bookings: CalendarBooking[];
  unavailability: CalendarUnavailability[];
}> {
  const supabase = await createClient();

  const [bookingResp, unavailResp] = await Promise.all([
    supabase
      .from('atelier_booking_crew')
      .select('confirmed_at, status, booking:atelier_bookings!atelier_booking_crew_booking_id_fkey(id, booking_ref, title, shoot_dates, state)')
      .eq('crew_id', crewId),
    supabase
      .from('atelier_crew_unavailability')
      .select('id, date_from, date_to, reason')
      .eq('crew_id', crewId)
      .order('date_from', { ascending: false }),
  ]);

  if (bookingResp.error) reportDataError('[person-calendar] crew bookings', bookingResp.error);
  if (unavailResp.error) reportDataError('[person-calendar] crew unavailability', unavailResp.error);

  type Row = {
    confirmed_at: string | null;
    status: string | null;
    booking: { id: string; booking_ref: string | null; title: string; shoot_dates: string | null; state: string } | null;
  };

  const bookings = ((bookingResp.data ?? []) as unknown as Row[])
    .filter((r) => r.booking && r.booking.shoot_dates)
    .map((r) => ({
      bookingId: r.booking!.id,
      bookingRef: r.booking!.booking_ref,
      title: r.booking!.title,
      shootDates: r.booking!.shoot_dates,
      confirmed: Boolean(r.confirmed_at),
      status: r.status ?? 'hold_requested',
    }));

  return {
    bookings,
    unavailability: (unavailResp.data ?? []) as CalendarUnavailability[],
  };
}
