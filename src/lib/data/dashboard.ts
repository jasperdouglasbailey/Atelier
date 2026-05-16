/**
 * Dashboard-specific aggregations.
 *
 * Three bespoke fetchers that power the redesigned `/` dashboard:
 *   - getMonthShootMarkers — shoot dates in the current month for the mini-calendar
 *   - getThisWeekRoster — talent + crew (with crew status) attached to shoots intersecting this week
 *   - getJobsNeedingCrew — confirmed bookings where any attached crew isn't yet 'confirmed'
 *
 * Keeps the dashboard page from doing per-booking N+1 fetches.
 */

import { createClient } from '@/lib/supabase/server';
import { parseDateRangeRaw } from '@/lib/utils/daterange';
import type { Booking, BookingState } from '@/lib/types/database';

const SHOOT_STATES: BookingState[] = [
  'quote_confirmed', 'pre_production', 'shoot_live', 'morning_after_check',
  'post_production', 'final_delivery', 'invoice_issued', 'paid',
];

// ============================================================
// Mini calendar — shoot markers for a given month
// ============================================================

export type MonthShootMarker = {
  date: string;           // YYYY-MM-DD
  bookingIds: string[];   // all bookings shooting on this date
};

/** Return one entry per shoot date in the month with the list of bookings on it. */
export async function getMonthShootMarkers(year: number, month: number): Promise<Map<string, string[]>> {
  // month is 0-indexed (0=January). Build inclusive start/end as YYYY-MM-DD strings
  // so we can string-compare without timezone surprises.
  const startISO = `${year}-${String(month + 1).padStart(2, '0')}-01`;
  const lastDay = new Date(year, month + 1, 0).getDate();
  const endISO = `${year}-${String(month + 1).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`;

  const supabase = await createClient();
  // No date-range filter at the DB layer — PostgREST doesn't expose the
  // daterange `&&` operator over the public API, and the column has no
  // denormalised start_date. We filter by SHOOT_STATES + non-null shoot_dates
  // and slice in JS. PostgREST defaults to a 1000-row ceiling per request,
  // which is plenty for current volume; if we ever approach it, the warning
  // below surfaces it before correctness breaks silently.
  const MAX_ROWS = 1000;
  const { data, error } = await supabase
    .from('atelier_bookings')
    .select('id, shoot_dates, state')
    .in('state', SHOOT_STATES)
    .not('shoot_dates', 'is', null)
    .range(0, MAX_ROWS - 1);

  if (error || !data) return new Map();

  if (data.length >= MAX_ROWS) {
    console.warn(`[dashboard.getMonthShootMarkers] hit ${MAX_ROWS}-row ceiling — paginate before this becomes wrong silently`);
  }

  const result = new Map<string, string[]>();
  for (const row of data as Array<{ id: string; shoot_dates: string | null; state: BookingState }>) {
    const range = parseDateRangeRaw(row.shoot_dates);
    if (!range.start || !range.end) continue;
    // Postgres daterange end is exclusive: '[2026-05-15,2026-05-17)' covers
    // 15 + 16, NOT 17. Walk from start (inclusive) up to but not including end.
    const startDate = new Date(`${range.start}T00:00:00`);
    const endDate = new Date(`${range.end}T00:00:00`);
    const iter = new Date(startDate);
    while (iter < endDate) {
      const y = iter.getFullYear();
      const m = String(iter.getMonth() + 1).padStart(2, '0');
      const d = String(iter.getDate()).padStart(2, '0');
      const key = `${y}-${m}-${d}`;
      if (key >= startISO && key <= endISO) {
        const existing = result.get(key) ?? [];
        if (!existing.includes(row.id)) existing.push(row.id);
        result.set(key, existing);
      }
      iter.setDate(iter.getDate() + 1);
    }
  }

  return result;
}

// ============================================================
// This-week roster — who's working, who's on hold
// ============================================================

export type ThisWeekTalent = {
  talentId: string;
  name: string;
  bookingId: string;
  bookingRef: string | null;
  bookingTitle: string;
  shootDateNotes: string | null;
};

export type ThisWeekCrew = {
  crewId: string;
  name: string;
  role: string | null;
  status: string;             // 'hold_requested' | 'sent' | 'confirmed' | etc.
  bookingId: string;
  bookingRef: string | null;
  bookingTitle: string;
  shootDateNotes: string | null;
};

/** Talent attached to bookings whose shoot dates intersect [startISO, endISO]. */
export async function getThisWeekRoster(bookingIds: string[]): Promise<{
  talent: ThisWeekTalent[];
  crewOnHold: ThisWeekCrew[];
  crewConfirmed: ThisWeekCrew[];
}> {
  if (bookingIds.length === 0) return { talent: [], crewOnHold: [], crewConfirmed: [] };

  const supabase = await createClient();
  const [talentResp, crewResp, bookingsResp] = await Promise.all([
    supabase
      .from('atelier_booking_talent')
      .select('booking_id, talent:atelier_talent(id, working_name)')
      .in('booking_id', bookingIds),
    supabase
      .from('atelier_booking_crew')
      .select('booking_id, role_on_booking, status, crew:atelier_crew(id, name, primary_role)')
      .in('booking_id', bookingIds),
    supabase
      .from('atelier_bookings')
      .select('id, booking_ref, title, shoot_date_notes')
      .in('id', bookingIds),
  ]);

  const bookingMap = new Map<string, { ref: string | null; title: string; dateNotes: string | null }>();
  for (const b of (bookingsResp.data ?? []) as Array<{ id: string; booking_ref: string | null; title: string; shoot_date_notes: string | null }>) {
    bookingMap.set(b.id, { ref: b.booking_ref, title: b.title, dateNotes: b.shoot_date_notes });
  }

  const talent: ThisWeekTalent[] = [];
  for (const row of (talentResp.data ?? []) as unknown[]) {
    const r = row as { booking_id: string; talent: { id: string; working_name: string } | null };
    if (!r.talent) continue;
    const b = bookingMap.get(r.booking_id);
    if (!b) continue;
    talent.push({
      talentId: r.talent.id,
      name: r.talent.working_name,
      bookingId: r.booking_id,
      bookingRef: b.ref,
      bookingTitle: b.title,
      shootDateNotes: b.dateNotes,
    });
  }

  const crewOnHold: ThisWeekCrew[] = [];
  const crewConfirmed: ThisWeekCrew[] = [];
  for (const row of (crewResp.data ?? []) as unknown[]) {
    const r = row as {
      booking_id: string;
      role_on_booking: string | null;
      status: string;
      crew: { id: string; name: string; primary_role: string | null } | null;
    };
    if (!r.crew) continue;
    const b = bookingMap.get(r.booking_id);
    if (!b) continue;
    const entry: ThisWeekCrew = {
      crewId: r.crew.id,
      name: r.crew.name,
      role: r.role_on_booking ?? r.crew.primary_role,
      status: r.status,
      bookingId: r.booking_id,
      bookingRef: b.ref,
      bookingTitle: b.title,
      shootDateNotes: b.dateNotes,
    };
    if (r.status === 'confirmed') crewConfirmed.push(entry);
    else crewOnHold.push(entry);
  }

  return { talent, crewOnHold, crewConfirmed };
}

// ============================================================
// Jobs needing crew confirmed
// ============================================================

export type JobNeedingCrew = {
  bookingId: string;
  bookingRef: string | null;
  title: string;
  state: BookingState;
  shootDateNotes: string | null;
  /** How many crew slots are still unconfirmed. */
  unconfirmedCount: number;
};

/** Confirmed-or-later bookings where at least one crew row isn't 'confirmed' yet. */
export async function getJobsNeedingCrew(): Promise<JobNeedingCrew[]> {
  const supabase = await createClient();
  const { data: bookings } = await supabase
    .from('atelier_bookings')
    .select('id, booking_ref, title, state, shoot_date_notes')
    .in('state', ['quote_confirmed', 'pre_production'])
    .limit(50);

  if (!bookings || bookings.length === 0) return [];

  const bookingIds = (bookings as Array<{ id: string }>).map((b) => b.id);
  const { data: crew } = await supabase
    .from('atelier_booking_crew')
    .select('booking_id, status')
    .in('booking_id', bookingIds);

  const unconfirmedByBooking = new Map<string, number>();
  for (const c of (crew ?? []) as Array<{ booking_id: string; status: string }>) {
    if (c.status === 'confirmed') continue;
    unconfirmedByBooking.set(c.booking_id, (unconfirmedByBooking.get(c.booking_id) ?? 0) + 1);
  }

  const result: JobNeedingCrew[] = [];
  for (const b of bookings as Array<{ id: string; booking_ref: string | null; title: string; state: BookingState; shoot_date_notes: string | null }>) {
    const unconfirmed = unconfirmedByBooking.get(b.id) ?? 0;
    if (unconfirmed === 0) continue;
    result.push({
      bookingId: b.id,
      bookingRef: b.booking_ref,
      title: b.title,
      state: b.state,
      shootDateNotes: b.shoot_date_notes,
      unconfirmedCount: unconfirmed,
    });
  }

  // Most-unconfirmed first
  return result.sort((a, b) => b.unconfirmedCount - a.unconfirmedCount).slice(0, 8);
}

// ============================================================
// Helper: ISO week range (Mon..Sun)
// ============================================================

export function thisWeekRange(now: Date = new Date()): { start: Date; end: Date } {
  const d = new Date(now);
  d.setHours(0, 0, 0, 0);
  const dow = d.getDay(); // 0=Sun, 1=Mon, ..., 6=Sat
  // Monday as start of week: shift back (dow=0 → 6, dow=1 → 0, dow=2 → 1, ...)
  const diff = (dow + 6) % 7;
  const start = new Date(d);
  start.setDate(d.getDate() - diff);
  const end = new Date(start);
  end.setDate(start.getDate() + 6);
  end.setHours(23, 59, 59, 999);
  return { start, end };
}

/** Booking IDs whose shoot_dates intersect [from, to]. */
export async function getBookingsInRange(from: Date, to: Date): Promise<Booking[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from('atelier_bookings')
    .select('*')
    .in('state', SHOOT_STATES)
    .not('shoot_dates', 'is', null)
    .limit(100);

  if (error || !data) return [];

  // Client-side intersection check — PostgREST daterange overlap operator isn't
  // exposed; for 50-100 rows this is fine.
  return (data as Booking[]).filter((b) => {
    if (!b.shoot_dates) return false;
    const range = parseDateRangeRaw(b.shoot_dates);
    if (!range.start || !range.end) return false;
    // Postgres daterange '[start,end)' — end is exclusive. Convert to inclusive
    // last day for intersection. start: inclusive; end: subtract one day.
    const startDate = new Date(`${range.start}T00:00:00`);
    const endDateExclusive = new Date(`${range.end}T00:00:00`);
    const endDateInclusive = new Date(endDateExclusive);
    endDateInclusive.setDate(endDateInclusive.getDate() - 1);
    return startDate <= to && endDateInclusive >= from;
  });
}
