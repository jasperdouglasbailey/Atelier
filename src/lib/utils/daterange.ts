/**
 * Postgres `daterange` round-trip helpers.
 *
 * Postgres stores ranges with an inclusive lower bound and an EXCLUSIVE
 * upper bound. So a 3-day shoot from May 15 → May 17 is stored as
 * `[2026-05-15,2026-05-18)`. When we display it in a form input, the
 * user expects to see "15" and "17" — so we have to subtract one day
 * from the stored upper bound for display, and add one day going back.
 *
 * Get this off-by-one wrong and every multi-day shoot ends a day early.
 * That's the kind of silent corruption that's expensive to catch in
 * production, so this util has full test coverage in `daterange.test.ts`.
 */

/**
 * Build a Postgres `daterange` literal from start/end ISO date strings.
 * - `end` defaults to `start` (single-day shoot)
 * - The stored upper bound is `end + 1 day` (exclusive)
 * - Returns `null` if `start` is falsy
 */
export function buildDateRange(
  start: string | null | undefined,
  end: string | null | undefined,
): string | null {
  if (!start) return null;
  const endDate = end || start;
  const exclusiveEnd = new Date(endDate + 'T00:00:00Z');
  exclusiveEnd.setUTCDate(exclusiveEnd.getUTCDate() + 1);
  const exclusiveEndStr = exclusiveEnd.toISOString().slice(0, 10);
  return `[${start},${exclusiveEndStr})`;
}

/**
 * Parse a Postgres `daterange` literal into form-friendly start/end
 * inclusive ISO date strings. Returns empty strings when the range is
 * null/empty (suitable for HTML date input `defaultValue`).
 *
 * Decrements the upper bound by 1 day to convert exclusive → inclusive.
 */
export function dateRangeToInputs(range: string | null | undefined): { start: string; end: string } {
  if (!range) return { start: '', end: '' };
  const m = range.match(/^[\[(](\d{4}-\d{2}-\d{2})?,(\d{4}-\d{2}-\d{2})?[\])]$/);
  if (!m || !m[1]) return { start: '', end: '' };
  const start = m[1];
  if (m[2]) {
    const end = new Date(m[2] + 'T00:00:00Z');
    end.setUTCDate(end.getUTCDate() - 1);
    return { start, end: end.toISOString().slice(0, 10) };
  }
  return { start, end: '' };
}

/**
 * Parse a Postgres `daterange` literal into raw start/end strings,
 * preserving the exclusive upper bound. Use this when you need the
 * literal stored values (e.g. for chart bucketing or range overlap
 * checks) — NOT for display.
 */
export function parseDateRangeRaw(range: string | null | undefined): { start: string | null; end: string | null } {
  if (!range) return { start: null, end: null };
  const m = range.match(/^[\[(](\d{4}-\d{2}-\d{2})?,(\d{4}-\d{2}-\d{2})?[\])]$/);
  if (!m) return { start: null, end: null };
  return { start: m[1] ?? null, end: m[2] ?? null };
}
