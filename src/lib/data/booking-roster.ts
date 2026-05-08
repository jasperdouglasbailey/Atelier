/**
 * Booking roster fetcher — pulls full contact details for the talent and
 * crew attached to a list of bookings. Used to populate the hover-pin card
 * on the bookings list / calendar so producers can copy artist + crew
 * details for client call sheets without opening the booking.
 *
 * Designed to be called once per page render with the visible booking IDs;
 * one round-trip per table (talent + crew), batched via Postgres `in`.
 */

import { createClient } from '@/lib/supabase/server';
import { reportDataError } from '@/lib/utils/data-errors';

export interface RosterPerson {
  id: string;
  name: string;
  mobile: string | null;
  email: string | null;
  dietary: string | null;
  drink_order: string | null;
  /** Free-text role on this booking, falling back to the entity's primary role. */
  role: string | null;
  /** City — only set on crew, used for the local-crew hint. */
  city: string | null;
}

export interface BookingRoster {
  bookingId: string;
  talent: RosterPerson[];
  crew: RosterPerson[];
}

/**
 * Fetch full roster (talent + crew with contact details) for a set of
 * bookings. Returns a Map keyed by bookingId. Bookings without entries
 * still get an entry in the map (with empty arrays) so callers can
 * dereference safely.
 */
export async function getBookingsRoster(bookingIds: string[]): Promise<Map<string, BookingRoster>> {
  const result = new Map<string, BookingRoster>();
  for (const id of bookingIds) {
    result.set(id, { bookingId: id, talent: [], crew: [] });
  }
  if (bookingIds.length === 0) return result;

  const supabase = await createClient();

  const [talentResp, crewResp] = await Promise.all([
    supabase
      .from('atelier_booking_talent')
      .select('booking_id, role_on_booking, talent:atelier_talent(id, working_name, mobile, email, dietary, drink_order)')
      .in('booking_id', bookingIds),
    supabase
      .from('atelier_booking_crew')
      .select('booking_id, role_on_booking, crew:atelier_crew(id, name, mobile, email, primary_role, dietary, drink_order, city)')
      .in('booking_id', bookingIds),
  ]);

  if (talentResp.error) reportDataError('[booking-roster] talent', talentResp.error);
  if (crewResp.error) reportDataError('[booking-roster] crew', crewResp.error);

  for (const row of (talentResp.data ?? []) as unknown[]) {
    const r = row as { booking_id: string; role_on_booking: string | null; talent: Record<string, unknown> | null };
    if (!r.talent) continue;
    const entry = result.get(r.booking_id);
    if (!entry) continue;
    entry.talent.push({
      id: r.talent.id as string,
      name: (r.talent.working_name as string) ?? 'Unknown',
      mobile: (r.talent.mobile as string) ?? null,
      email: (r.talent.email as string) ?? null,
      dietary: (r.talent.dietary as string) ?? null,
      drink_order: (r.talent.drink_order as string) ?? null,
      role: r.role_on_booking ?? null,
      city: null,
    });
  }

  for (const row of (crewResp.data ?? []) as unknown[]) {
    const r = row as { booking_id: string; role_on_booking: string | null; crew: Record<string, unknown> | null };
    if (!r.crew) continue;
    const entry = result.get(r.booking_id);
    if (!entry) continue;
    entry.crew.push({
      id: r.crew.id as string,
      name: (r.crew.name as string) ?? 'Unknown',
      mobile: (r.crew.mobile as string) ?? null,
      email: (r.crew.email as string) ?? null,
      dietary: (r.crew.dietary as string) ?? null,
      drink_order: (r.crew.drink_order as string) ?? null,
      role: r.role_on_booking ?? (r.crew.primary_role as string | null) ?? null,
      city: (r.crew.city as string) ?? null,
    });
  }

  return result;
}
