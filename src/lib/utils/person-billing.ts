/**
 * Person-billing breakdowns.
 *
 * Five "what does this person get paid?" surfaces (crew bill, artist
 * remittance, JobPnLPanel paid-out, accounting print, remittance email)
 * historically read ONLY from `atelier_fee_lines` filtered by the
 * recipient's id. That misses the day-rate income that lives on the
 * booking-team roster row (`atelier_booking_crew` /
 * `atelier_booking_talent`), because adding crew/talent to a booking
 * writes to the roster table without auto-creating a `crew_labour` /
 * `artist_fee` fee line.
 *
 * Concretely Chelsea Oh's bill on BOOK-0006 showed only her OT line
 * ($180), missing the 2-day day-rate income ($550 × 2 = $1100) — the
 * user-reported bug that prompted this module.
 *
 * These helpers UNION the two sources for ONE person:
 *   - Synthesised "virtual" labour rows from the roster's day_rate +
 *     assigned_dates (honouring per-day `assigned_dates_rate_overrides`).
 *   - Plus the fee_lines tagged with the person's id, split into
 *     overtime / expenses / custom-labour buckets that map cleanly to
 *     `computeCrewPayment` and `computeArtistPayment` in fee-engine.
 *
 * Virtual rows are NEVER persisted — they're computed at render time
 * from data already in the schema. The booking-team flow is untouched.
 */

import type { BookingTalent, BookingCrew, FeeLine, FeeLineType } from '@/lib/types/database';
import { effectiveCost } from '@/lib/utils/fee-engine';
import { parseDateRangeRaw } from '@/lib/utils/daterange';

// ============================================================
// Shared types
// ============================================================

/** A "virtual" line row — looks like a fee line on the bill but isn't persisted. */
export type VirtualLineRow = {
  /** Stable client-side key. Not a database id. */
  key: string;
  description: string;
  quantity: number;
  unitPrice: number;
  /** quantity × unitPrice, rounded to cents. */
  subtotal: number;
  /** Sub-label shown on the bill (e.g. "Day rate", "Usage fee"). */
  category: string;
};

// ============================================================
// Crew classification
// ============================================================

/**
 * Crew-relevant line types where a crew member CAN be attributed.
 * Used by QuoteBuilder to gate the crew picker, and by the bill/P&L
 * surfaces to split fee_lines into overtime / expenses / custom-labour.
 *
 * Artist-specific types are intentionally excluded: artist_fee,
 * usage_licence, file_management, retouching, post_production,
 * artist_overtime, artist_travel — those auto-link to primary talent.
 */
export const CREW_RELEVANT_LINE_TYPES = new Set<FeeLineType>([
  'crew_labour',
  'overtime',
  'travel',
  'catering',
  'wardrobe',
  'props',
  'casting',
  'location_fee',
  'permits',
  'insurance',
  'other_expense',
  'crew_equipment',
  'studio_hire',
  'equipment_rental',
]);

const CREW_SUPER_BEARING_TYPES = new Set<FeeLineType>(['crew_labour']);
const CREW_OVERTIME_TYPES = new Set<FeeLineType>(['overtime']);
// "Custom labour" = explicit crew_labour fee lines (rare — the day-rate
// row from the roster usually serves this purpose). Treated as additional
// super-bearing labour alongside the synthesised virtual rows.

// ============================================================
// Helpers
// ============================================================

/**
 * Walk a Postgres daterange string ("[YYYY-MM-DD,YYYY-MM-DD)") and
 * return each covered day as YYYY-MM-DD. The end is EXCLUSIVE per
 * Postgres convention.
 *
 * Used when an `atelier_booking_crew` row has no `assigned_dates`
 * (legacy rows) — we fall back to all shoot days on the booking.
 */
function expandShootDates(daterangeLiteral: string | null | undefined): string[] {
  const { start, end } = parseDateRangeRaw(daterangeLiteral);
  if (!start || !end) return [];
  const out: string[] = [];
  const iter = new Date(`${start}T00:00:00`);
  const stop = new Date(`${end}T00:00:00`);
  while (iter < stop) {
    out.push(
      `${iter.getFullYear()}-${String(iter.getMonth() + 1).padStart(2, '0')}-${String(iter.getDate()).padStart(2, '0')}`,
    );
    iter.setDate(iter.getDate() + 1);
  }
  return out;
}

/** Format a YYYY-MM-DD as "Mon 13 May" for bill rows. */
function formatDayShort(iso: string): string {
  try {
    return new Date(`${iso}T00:00:00`).toLocaleDateString('en-AU', {
      weekday: 'short', day: 'numeric', month: 'short',
    });
  } catch {
    return iso;
  }
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

// ============================================================
// Crew breakdown
// ============================================================

export type CrewBillBreakdown = {
  /** Synthesised day-rate rows — one per assigned date (or shoot date). */
  labourRows: VirtualLineRow[];
  /** Persisted fee lines tagged with this crew_id, split by category. */
  overtimeLines: FeeLine[];
  expensesLines: FeeLine[];
  customLabourLines: FeeLine[];
  /** Subtotals derived from the union — feed straight into computeCrewPayment. */
  labourSubtotal: number;
  overtimeSubtotal: number;
  expensesSubtotal: number;
  /** Combined for display ordering — virtual rows first, then OT, then expenses. */
  totalRowCount: number;
};

/**
 * Build a unified bill breakdown for one crew member on one booking.
 *
 * `bookingCrew` is the roster row (atelier_booking_crew) for this crew on
 * this booking. Pass `null` if the crew member isn't attached — no
 * virtual labour rows will be synthesised, only the fee_lines (if any).
 *
 * `shootDates` is the booking's `shoot_dates` daterange literal — used as
 * fallback when the roster row has no `assigned_dates`.
 *
 * `feeLines` should be ALL fee lines on the booking; the helper filters
 * by crew_id internally.
 */
export function buildCrewBillBreakdown(opts: {
  bookingCrew: BookingCrew | null;
  shootDates: string | null;
  feeLines: FeeLine[];
}): CrewBillBreakdown {
  const { bookingCrew, shootDates, feeLines } = opts;
  const crewId = bookingCrew?.crew_id ?? null;

  // 1. Synthesise virtual labour rows from the roster row.
  const labourRows: VirtualLineRow[] = [];
  if (bookingCrew && bookingCrew.day_rate != null) {
    const defaultRate = bookingCrew.day_rate;
    const overrides = bookingCrew.assigned_dates_rate_overrides ?? {};
    // Prefer the explicit assigned_dates; fall back to walking the
    // booking's shoot_dates if the roster row has none (legacy data).
    const days = (bookingCrew.assigned_dates && bookingCrew.assigned_dates.length > 0)
      ? bookingCrew.assigned_dates
      : expandShootDates(shootDates);

    for (const day of days) {
      const rate = overrides[day] != null ? Number(overrides[day]) : Number(defaultRate);
      labourRows.push({
        key: `virtual-${bookingCrew.id}-${day}`,
        description: `Day rate — ${formatDayShort(day)}`,
        quantity: 1,
        unitPrice: rate,
        subtotal: round2(rate),
        category: 'Crew labour',
      });
    }
  }

  // 2. Tagged fee_lines for this crew member, split by category.
  const tagged = crewId
    ? feeLines.filter((l) => l.crew_id === crewId)
    : [];

  const overtimeLines: FeeLine[] = [];
  const expensesLines: FeeLine[] = [];
  const customLabourLines: FeeLine[] = [];
  for (const line of tagged) {
    if (CREW_OVERTIME_TYPES.has(line.line_type)) {
      overtimeLines.push(line);
    } else if (CREW_SUPER_BEARING_TYPES.has(line.line_type)) {
      customLabourLines.push(line);
    } else {
      // Everything else crew-tagged is treated as an expense: crew_equipment,
      // travel, catering, props, etc. computeCrewPayment doesn't apply super
      // to expenses, which is correct for these.
      expensesLines.push(line);
    }
  }

  // 3. Subtotals — virtual rows + persisted custom-labour go into labour;
  //    OT and expenses each have their own bucket.
  const virtualLabourTotal = labourRows.reduce((s, r) => s + r.subtotal, 0);
  const customLabourTotal = customLabourLines.reduce((s, l) => s + effectiveCost(l), 0);
  const labourSubtotal = round2(virtualLabourTotal + customLabourTotal);
  const overtimeSubtotal = round2(overtimeLines.reduce((s, l) => s + effectiveCost(l), 0));
  const expensesSubtotal = round2(expensesLines.reduce((s, l) => s + effectiveCost(l), 0));

  return {
    labourRows,
    overtimeLines,
    expensesLines,
    customLabourLines,
    labourSubtotal,
    overtimeSubtotal,
    expensesSubtotal,
    totalRowCount: labourRows.length + customLabourLines.length + overtimeLines.length + expensesLines.length,
  };
}

// ============================================================
// Artist breakdown
// ============================================================

/**
 * Artist-side line types. Matches the existing ARTIST_LINE_TYPES set
 * in fee-engine / QuoteBuilder — duplicated here so this module stays
 * self-contained (the file-level imports cycle is the price).
 */
const ARTIST_FEE_TYPES = new Set<FeeLineType>([
  'artist_fee',
  'usage_licence',
  'file_management',
  'retouching',
  'post_production',
  'artist_overtime',
  'artist_travel',
]);

export type ArtistBillBreakdown = {
  /** Synthesised day-rate + usage_fee rows. */
  labourRows: VirtualLineRow[];
  /** Persisted artist fee_lines tagged with this talent_id. */
  feeLines: FeeLine[];
  /** Subtotal (gross fees) for feeding into `computeArtistPayment`. */
  feeSubtotal: number;
};

/**
 * Build a unified remittance breakdown for one talent on one booking.
 *
 * `bookingTalent` is the roster row. `shootDates` falls back when not
 * present. `feeLines` should be all booking fee lines.
 *
 * Differs from crew in three ways:
 *  - There's no super/overtime split on the artist side — all fees feed
 *    into a single "gross" number for computeArtistPayment.
 *  - The roster row has `day_rate` AND `usage_fee` (separate line on the
 *    bill).
 *  - Artist `half_day_rate` is not currently used at remittance time —
 *    the booking-team UI lets the operator pick it as the effective rate
 *    but downstream the value lands in `day_rate`. Worth noting if half-
 *    day handling ever needs differentiating later.
 */
export function buildArtistBillBreakdown(opts: {
  bookingTalent: BookingTalent | null;
  shootDates: string | null;
  feeLines: FeeLine[];
}): ArtistBillBreakdown {
  const { bookingTalent, shootDates, feeLines } = opts;
  const talentId = bookingTalent?.talent_id ?? null;

  // 1. Virtual labour rows: one per shoot day + an optional usage row.
  const labourRows: VirtualLineRow[] = [];
  if (bookingTalent) {
    if (bookingTalent.day_rate != null) {
      const rate = Number(bookingTalent.day_rate);
      const days = expandShootDates(shootDates);
      if (days.length > 0) {
        for (const day of days) {
          labourRows.push({
            key: `virtual-${bookingTalent.id}-${day}`,
            description: `Day rate — ${formatDayShort(day)}`,
            quantity: 1,
            unitPrice: rate,
            subtotal: round2(rate),
            category: 'Artist fee',
          });
        }
      } else {
        // No shoot_dates known yet — show a single unitised row so the
        // recipient at least sees the rate.
        labourRows.push({
          key: `virtual-${bookingTalent.id}-day-rate`,
          description: 'Day rate',
          quantity: 1,
          unitPrice: rate,
          subtotal: round2(rate),
          category: 'Artist fee',
        });
      }
    }
    if (bookingTalent.usage_fee != null && Number(bookingTalent.usage_fee) > 0) {
      const fee = Number(bookingTalent.usage_fee);
      labourRows.push({
        key: `virtual-${bookingTalent.id}-usage`,
        description: 'Usage licence',
        quantity: 1,
        unitPrice: fee,
        subtotal: round2(fee),
        category: 'Usage licence',
      });
    }
  }

  // 2. Persisted fee lines tagged with this talent_id (artist types only).
  //    Reimbursements are excluded from gross fees per existing doctrine —
  //    they pass through at cost and don't take commission.
  const tagged = talentId
    ? feeLines.filter(
        (l) =>
          l.talent_id === talentId &&
          ARTIST_FEE_TYPES.has(l.line_type) &&
          !l.is_artist_reimbursement,
      )
    : [];

  const virtualTotal = labourRows.reduce((s, r) => s + r.subtotal, 0);
  const taggedTotal = tagged.reduce((s, l) => s + effectiveCost(l), 0);
  const feeSubtotal = round2(virtualTotal + taggedTotal);

  return {
    labourRows,
    feeLines: tagged,
    feeSubtotal,
  };
}
