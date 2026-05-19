/**
 * Australian fiscal year helpers.
 *
 * AU FY runs 1 July → 30 June. So:
 *   - 15 Mar 2026   →  FY starts 1 Jul 2025, ends 30 Jun 2026
 *   - 15 Aug 2026   →  FY starts 1 Jul 2026, ends 30 Jun 2027
 *
 * Use this anywhere a report needs to align with how the agency
 * actually files: BAS quarters, annual income tax, year-end. Don't use
 * for "what's happening today" / dashboard greeting (calendar date is
 * still correct there).
 *
 * Returns ISO date strings (YYYY-MM-DD) for ease of SQL filtering and
 * consistent timezone behaviour — Postgres compares lexicographically.
 */

export type FiscalYearRange = {
  /** Inclusive start: '2025-07-01'. */
  startISO: string;
  /** EXCLUSIVE end: '2026-07-01'. Use < not <= when filtering. */
  endExclusiveISO: string;
  /** Label like "FY 25/26" for UI rendering. */
  label: string;
};

/**
 * Return the AU FY range containing `now`. Defaults to `new Date()` —
 * pass a specific date when computing comparison periods (e.g. last
 * FY for YoY).
 */
export function currentFiscalYear(now: Date = new Date()): FiscalYearRange {
  const year = now.getFullYear();
  const month = now.getMonth() + 1; // 1-12
  // Jan-Jun → FY started 1 Jul (year-1). Jul-Dec → FY started 1 Jul year.
  const fyStartYear = month < 7 ? year - 1 : year;
  const fyEndYear = fyStartYear + 1;
  return {
    startISO: `${fyStartYear}-07-01`,
    endExclusiveISO: `${fyEndYear}-07-01`,
    label: `FY ${String(fyStartYear).slice(2)}/${String(fyEndYear).slice(2)}`,
  };
}

/** Last full FY before the one containing `now`. Used for YoY comparison. */
export function previousFiscalYear(now: Date = new Date()): FiscalYearRange {
  const current = currentFiscalYear(now);
  const prevStartYear = parseInt(current.startISO.slice(0, 4), 10) - 1;
  const prevEndYear = prevStartYear + 1;
  return {
    startISO: `${prevStartYear}-07-01`,
    endExclusiveISO: `${prevEndYear}-07-01`,
    label: `FY ${String(prevStartYear).slice(2)}/${String(prevEndYear).slice(2)}`,
  };
}

/** True iff the given ISO/date string falls inside `range` (start inclusive, end exclusive). */
export function isInFiscalYear(dateISO: string, range: FiscalYearRange): boolean {
  return dateISO >= range.startISO && dateISO < range.endExclusiveISO;
}
