import { createClient } from '@/lib/supabase/server';
import { parseDateRangeRaw as parseDateRange } from '@/lib/utils/daterange';

export interface CrewBookingRow {
  id: string;
  crew_id: string;
  crew_name: string;
  crew_role: string | null;
  crew_tier: string;
  role_on_booking: string | null;
  day_rate: number | null;
  status: string;
  booking_id: string;
  booking_ref: string | null;
  booking_title: string;
  booking_state: string;
  booking_tier: string;
  shoot_date_notes: string | null;
  shoot_start: string | null; // YYYY-MM-DD
  shoot_end: string | null;   // YYYY-MM-DD (exclusive — Postgres daterange convention)
}

/**
 * Cross-cutting crew-bookings view. Returns all crew assignments
 * joined with booking + crew info for the crew-centric dashboard.
 * Pass crewId to filter to a single crew member (for the detail page).
 */
export async function listCrewBookings(crewId?: string): Promise<CrewBookingRow[]> {
  const supabase = await createClient();

  let query = supabase
    .from('atelier_booking_crew')
    .select(`
      id,
      crew_id,
      role_on_booking,
      day_rate,
      status,
      booking_id,
      crew:atelier_crew(name, primary_role, tier),
      booking:atelier_bookings(booking_ref, title, state, tier, shoot_date_notes, shoot_dates)
    `);

  if (crewId) {
    query = query.eq('crew_id', crewId);
  } else {
    query = query.order('crew_id');
  }

  const { data, error } = await query;

  if (error) {
    console.error('[crew-bookings] list', error.message);
    return [];
  }

  return ((data ?? []) as unknown[]).map((row: unknown) => {
    const r = row as Record<string, unknown>;
    const crew = r.crew as Record<string, unknown> | null;
    const booking = r.booking as Record<string, unknown> | null;
    const range = parseDateRange(booking?.shoot_dates as string | null);
    return {
      id: r.id as string,
      crew_id: r.crew_id as string,
      crew_name: (crew?.name as string) ?? 'Unknown',
      crew_role: (crew?.primary_role as string) ?? null,
      crew_tier: (crew?.tier as string) ?? 'regular_freelance',
      role_on_booking: r.role_on_booking as string | null,
      day_rate: r.day_rate as number | null,
      status: r.status as string,
      booking_id: r.booking_id as string,
      booking_ref: (booking?.booking_ref as string) ?? null,
      booking_title: (booking?.title as string) ?? 'Unknown',
      booking_state: (booking?.state as string) ?? 'brief_received',
      booking_tier: (booking?.tier as string) ?? 'content',
      shoot_date_notes: (booking?.shoot_date_notes as string) ?? null,
      shoot_start: range.start,
      shoot_end: range.end,
    };
  });
}

export interface CalendarShoot {
  bookingId: string;
  bookingRef: string | null;
  title: string;
  state: string;
  tier: string;
  start: string;            // YYYY-MM-DD inclusive
  end: string;              // YYYY-MM-DD inclusive (we collapse Postgres' exclusive end here)
  crew: { id: string; name: string; role: string | null; tier: string }[];
}

/**
 * Returns one entry per booking that has a shoot_dates value, with the crew
 * assigned. Used by the calendar view. Shoots without a date range are
 * excluded — they have nowhere to land on a calendar.
 */
export async function getCalendarShoots(): Promise<CalendarShoot[]> {
  const rows = await listCrewBookings();

  const byBooking = new Map<string, CalendarShoot>();
  for (const r of rows) {
    if (!r.shoot_start) continue;
    if (!byBooking.has(r.booking_id)) {
      // Postgres daterange ends are exclusive; for display we want last shoot day inclusive.
      const endExclusive = r.shoot_end;
      let endInclusive = endExclusive;
      if (endExclusive) {
        const d = new Date(endExclusive + 'T00:00:00Z');
        d.setUTCDate(d.getUTCDate() - 1);
        endInclusive = d.toISOString().slice(0, 10);
      }
      byBooking.set(r.booking_id, {
        bookingId: r.booking_id,
        bookingRef: r.booking_ref,
        title: r.booking_title,
        state: r.booking_state,
        tier: r.booking_tier,
        start: r.shoot_start,
        end: endInclusive ?? r.shoot_start,
        crew: [],
      });
    }
    byBooking.get(r.booking_id)!.crew.push({
      id: r.crew_id,
      name: r.crew_name,
      role: r.crew_role,
      tier: r.crew_tier,
    });
  }

  // Also pull bookings that have a shoot_dates set but no crew assigned yet —
  // they should still show on the calendar (Jasper hasn't booked the crew yet).
  const supabase = await createClient();
  const { data: orphans } = await supabase
    .from('atelier_bookings')
    .select('id, booking_ref, title, state, tier, shoot_dates')
    .not('shoot_dates', 'is', null);

  for (const b of (orphans ?? []) as Record<string, unknown>[] ) {
    const id = b.id as string;
    if (byBooking.has(id)) continue;
    const range = parseDateRange(b.shoot_dates as string | null);
    if (!range.start) continue;
    let endInclusive = range.end;
    if (range.end) {
      const d = new Date(range.end + 'T00:00:00Z');
      d.setUTCDate(d.getUTCDate() - 1);
      endInclusive = d.toISOString().slice(0, 10);
    }
    byBooking.set(id, {
      bookingId: id,
      bookingRef: (b.booking_ref as string) ?? null,
      title: (b.title as string) ?? 'Untitled',
      state: (b.state as string) ?? 'brief_received',
      tier: (b.tier as string) ?? 'content',
      start: range.start,
      end: endInclusive ?? range.start,
      crew: [],
    });
  }

  return Array.from(byBooking.values()).sort((a, b) => a.start.localeCompare(b.start));
}
