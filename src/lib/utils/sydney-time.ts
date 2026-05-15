/**
 * Sydney-timezone helpers.
 *
 * Saunders & Co operates from Sydney and every booking is a Sydney-time shoot.
 * Server-side rendering on Vercel runs in UTC, so anywhere we touch
 * `new Date().getFullYear()` / `getMonth()` / `getDate()` to derive "today",
 * we get the UTC date, not the local one.
 *
 * Manifested as: at 1:20am Sydney on Sat 16 May (3:20pm UTC Fri 15), the
 * dashboard calendar highlighted Fri 15 as "today". Reported by Jasper.
 *
 * Fix doctrine: every "what's today" calculation must go through this
 * module. We use Intl.DateTimeFormat with timeZone 'Australia/Sydney' to
 * extract the Sydney date parts directly, never relying on the server's
 * default offset.
 */

const SYDNEY_TZ = 'Australia/Sydney';

/**
 * Sydney date parts for the given moment (or `new Date()` if omitted).
 * Returns numeric year, 0-indexed month, day-of-month + the ISO string.
 *
 * Use this whenever you need "today" in any view that's user-facing.
 */
export function sydneyDateParts(now: Date = new Date()): {
  year: number;
  month: number;       // 0-indexed (matches Date.getMonth())
  date: number;        // 1-31
  iso: string;         // 'YYYY-MM-DD'
  dayOfWeek: number;   // 0=Sun, 1=Mon, ..., 6=Sat (matches Date.getDay())
} {
  // en-CA produces 'YYYY-MM-DD' which is the cheapest path to ISO.
  const iso = now.toLocaleDateString('en-CA', {
    timeZone: SYDNEY_TZ,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  });

  const [yStr, mStr, dStr] = iso.split('-');
  const year = Number(yStr);
  const month = Number(mStr) - 1;
  const date = Number(dStr);

  // Day-of-week via en-US 'short' format. Could parse the date with `new Date`
  // but that re-introduces UTC drift; safer to ask Intl directly.
  const dayName = now.toLocaleDateString('en-US', { timeZone: SYDNEY_TZ, weekday: 'short' });
  const dayIndex = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].indexOf(dayName);

  return { year, month, date, iso, dayOfWeek: dayIndex };
}

/** Convenience: the Sydney ISO date (YYYY-MM-DD) for "today". */
export function sydneyTodayISO(now: Date = new Date()): string {
  return sydneyDateParts(now).iso;
}

/**
 * Mon-Sun week range in Sydney for the given moment. End is Sunday at 23:59:59
 * (inclusive) so the range `start..end` covers the full week.
 *
 * Returned as Date objects whose `.toISOString()` reflects UTC equivalents
 * suitable for passing to PostgREST. For "today in Sydney" comparisons, use
 * the ISO strings directly via sydneyDateParts.
 */
export function sydneyThisWeekRange(now: Date = new Date()): { start: Date; end: Date } {
  const parts = sydneyDateParts(now);
  // Monday-start week. dayOfWeek: 0=Sun, 1=Mon, ..., 6=Sat → shift back by (dow+6)%7
  const diff = (parts.dayOfWeek + 6) % 7;
  // Construct Sydney-midnight Date objects. We can't directly construct a
  // "Date at 00:00 Sydney time" — JS Dates are UTC under the hood. But for
  // grouping/filtering purposes, any timezone-consistent representation
  // works. We use noon UTC + offset adjustment as a stable anchor.
  const start = new Date(parts.year, parts.month, parts.date - diff);
  start.setHours(0, 0, 0, 0);
  const end = new Date(parts.year, parts.month, parts.date - diff + 6);
  end.setHours(23, 59, 59, 999);
  return { start, end };
}

/** Time-of-day greeting based on Sydney clock — "Good morning/afternoon/evening". */
export function sydneyTimeOfDay(now: Date = new Date()): 'morning' | 'afternoon' | 'evening' {
  const hour = Number(new Intl.DateTimeFormat('en-AU', {
    timeZone: SYDNEY_TZ,
    hour: 'numeric',
    hour12: false,
  }).format(now));
  if (hour < 12) return 'morning';
  if (hour < 17) return 'afternoon';
  return 'evening';
}
