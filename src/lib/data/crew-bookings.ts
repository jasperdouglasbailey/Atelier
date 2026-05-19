import { createClient } from '@/lib/supabase/server';
import { reportDataError } from '@/lib/utils/data-errors';
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
 * Crew-assignment join view. Returns booking_crew rows decorated with
 * crew + booking metadata. The dedicated `/crew-bookings` route was
 * consolidated into `/bookings?view=calendar` and the per-crew detail
 * page; this function is still used by `/crew/[id]` (pass crewId) and
 * by getCalendarShoots() below (no filter).
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
    reportDataError('[crew-bookings] list', error);
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

/**
 * Returns a Map of crew_id → list of bookings whose shoot dates overlap
 * the given range. Used by BookingTeam to flag crew who are already
 * booked elsewhere on the same dates ("availability warning"). The check
 * is a soft warning — producers can still add the person; sometimes you
 * intentionally double-book to confirm later.
 *
 * Excludes the current booking from the result (so a crew member already
 * on this booking doesn't flag itself).
 */
export async function getCrewBookedOnRange(opts: {
  startDate: string; // YYYY-MM-DD inclusive
  endDate: string;   // YYYY-MM-DD inclusive
  excludeBookingId?: string | null;
}): Promise<Map<string, Array<{ bookingId: string; bookingRef: string | null; title: string; start: string; end: string }>>> {
  const supabase = await createClient();

  // Pull booking_crew rows whose linked booking has overlapping shoot_dates.
  // PostgREST can't filter on embedded fields with overlap operators; we do
  // a wide pull then filter in JS.
  const { data, error } = await supabase
    .from('atelier_booking_crew')
    .select(`
      crew_id,
      booking:atelier_bookings(id, booking_ref, title, shoot_dates, state)
    `)
    .neq('status', 'declined')
    .neq('status', 'released');

  const result = new Map<string, Array<{ bookingId: string; bookingRef: string | null; title: string; start: string; end: string }>>();
  if (error || !data) return result;

  const startDate = opts.startDate;
  const endDate = opts.endDate;

  for (const row of (data ?? []) as unknown as Array<{
    crew_id: string;
    booking: { id: string; booking_ref: string | null; title: string; shoot_dates: string | null; state: string } | null;
  }>) {
    const b = row.booking;
    if (!b) continue;
    if (opts.excludeBookingId && b.id === opts.excludeBookingId) continue;
    if (b.state === 'released' || b.state === 'cancelled') continue;
    const range = parseDateRange(b.shoot_dates);
    if (!range.start) continue;
    // Convert to inclusive end (shoot_dates is exclusive)
    let endInclusive = range.end;
    if (range.end) {
      const d = new Date(range.end + 'T00:00:00Z');
      d.setUTCDate(d.getUTCDate() - 1);
      endInclusive = d.toISOString().slice(0, 10);
    }
    const otherStart = range.start;
    const otherEnd = endInclusive ?? range.start;
    // Overlap test: ranges [a..b] and [c..d] overlap iff a<=d && c<=b
    if (otherStart <= endDate && startDate <= otherEnd) {
      const list = result.get(row.crew_id) ?? [];
      list.push({
        bookingId: b.id,
        bookingRef: b.booking_ref,
        title: b.title,
        start: otherStart,
        end: otherEnd,
      });
      result.set(row.crew_id, list);
    }
  }

  return result;
}

export interface CalendarShoot {
  bookingId: string;
  bookingRef: string | null;
  title: string;
  state: string;
  tier: string;
  start: string;            // YYYY-MM-DD inclusive
  end: string;              // YYYY-MM-DD inclusive (we collapse Postgres' exclusive end here)
  /** Display name of the client — company falls back to contact name. */
  clientName: string | null;
  /** Brand display name. */
  brandName: string | null;
  /** Free-text shoot location (used for the city-local hint). */
  shootLocation: string | null;
  /** Talent attached to the booking — used for the title format and hover card. */
  talentNames: string[];
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
        clientName: null,
        brandName: null,
        shootLocation: null,
        talentNames: [],
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
  // Same query also enriches every entry with client / brand / talent / location
  // so the calendar bar can render the agreed title format and hover card.
  const supabase = await createClient();
  // Migration 0071 dropped atelier_bookings.brand_id. The `brand:` join
  // here is implicit (no explicit FK hint) so PostgREST tolerates it
  // returning null, but we drop it for clarity + future-proofing.
  const { data: enrichRows } = await supabase
    .from('atelier_bookings')
    .select(`
      id, booking_ref, title, state, tier, shoot_dates, shoot_location,
      client:atelier_clients!atelier_bookings_client_id_fkey(name, company),
      booking_talent:atelier_booking_talent(talent:atelier_talent(working_name))
    `)
    .not('shoot_dates', 'is', null);

  for (const b of (enrichRows ?? []) as Record<string, unknown>[]) {
    const id = b.id as string;
    const client = b.client as { name?: string; company?: string | null } | null;
    const brand = null as { name?: string } | null; // brand removed with migration 0071
    const bookingTalent = (b.booking_talent ?? []) as Array<{ talent: { working_name?: string } | null }>;
    const talentNames = bookingTalent
      .map((bt) => bt.talent?.working_name)
      .filter((n): n is string => typeof n === 'string' && n.length > 0);

    const clientName = client?.company || client?.name || null;
    const brandName = brand?.name ?? null;
    const shootLocation = (b.shoot_location as string) ?? null;

    if (byBooking.has(id)) {
      // Enrich existing entry (had crew, missing the narrative fields)
      const entry = byBooking.get(id)!;
      entry.clientName = clientName;
      entry.brandName = brandName;
      entry.shootLocation = shootLocation;
      entry.talentNames = talentNames;
      continue;
    }

    // Booking has no crew — add it with full enrichment
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
      clientName,
      brandName,
      shootLocation,
      talentNames,
      crew: [],
    });
  }

  return Array.from(byBooking.values()).sort((a, b) => a.start.localeCompare(b.start));
}
