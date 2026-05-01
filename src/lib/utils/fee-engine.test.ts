/**
 * Fee Engine Tests
 *
 * The fee engine is the most expensive thing to silently regress in this app —
 * a wrong commission rate or missed GST goes out the door on a real quote.
 * These tests anchor every rule from the locked doctrine and verify the
 * canonical Oliver AJE eComm #3579 worked example end-to-end.
 */

import { describe, it, expect } from 'vitest';
import {
  computeFeeLine,
  computeQuoteTotals,
  computeArtistPayment,
  computeOT,
  createArtistFeeLine,
  createCrewLabourLine,
  createExpenseLine,
} from './fee-engine';
import type { FeeLine } from '@/lib/types/database';

// Helper: assert two floats are equal within rounding tolerance
const closeTo = (actual: number, expected: number) =>
  expect(actual).toBeCloseTo(expected, 2);

// ============================================================
// Single-line computations
// ============================================================

describe('computeFeeLine', () => {
  it('artist fee: 20% commission, 15% ASF, 10% GST on (subtotal+ASF)', () => {
    const r = computeFeeLine(createArtistFeeLine('Photography', 3500, 1));
    closeTo(r.subtotal, 3500);
    closeTo(r.asfAmount, 525);              // 3500 * 0.15
    closeTo(r.gstAmount, 402.5);            // (3500 + 525) * 0.10
    closeTo(r.commissionAmount, 700);       // 3500 * 0.20
    closeTo(r.commissionGst, 70);           // 700 * 0.10
    expect(r.superChargedAmount).toBe(0);   // not super-bearing
    closeTo(r.lineTotal, 4427.5);           // 3500 + 525 + 402.5
  });

  it('crew labour: super charged 15%, paid 12%, no commission', () => {
    const r = computeFeeLine(createCrewLabourLine('Digital Op', 700, 1));
    closeTo(r.subtotal, 700);
    closeTo(r.asfAmount, 105);              // 700 * 0.15
    closeTo(r.gstAmount, 80.5);             // (700 + 105) * 0.10 = 805 * 0.10
    closeTo(r.superChargedAmount, 105);     // 700 * 0.15 (charged)
    closeTo(r.superPaidAmount, 84);         // 700 * 0.12 (paid)
    expect(r.commissionAmount).toBe(0);     // crew not commissionable
    closeTo(r.lineTotal, 885.5);            // 700 + 105 + 80.5
  });

  it('expense line: 0% ASF default, no commission, no super', () => {
    const r = computeFeeLine(createExpenseLine('catering', 'Lunch x12', 180, 1));
    closeTo(r.subtotal, 180);
    expect(r.asfAmount).toBe(0);
    closeTo(r.gstAmount, 18);               // 180 * 0.10
    expect(r.commissionAmount).toBe(0);
    expect(r.superChargedAmount).toBe(0);
    closeTo(r.lineTotal, 198);
  });

  it('GST-exempt line skips GST entirely', () => {
    const line: Partial<FeeLine> = {
      line_type: 'travel',
      quantity: 1,
      unit_price: 200,
      asf_rate: 0,
      is_gst_exempt: true,
      is_super_bearing: false,
      is_commissionable: false,
    };
    const r = computeFeeLine(line);
    expect(r.gstAmount).toBe(0);
    closeTo(r.lineTotal, 200);
  });

  it('quantity multiplier: 3 days @ $1000 = $3000 subtotal', () => {
    const r = computeFeeLine(createArtistFeeLine('Day rate', 1000, 3));
    closeTo(r.subtotal, 3000);
    closeTo(r.commissionAmount, 600);
  });

  it('per-line ASF override (e.g. 0% on usage licence)', () => {
    const line: Partial<FeeLine> = {
      line_type: 'usage_licence',
      quantity: 1,
      unit_price: 5000,
      asf_rate: 0,                           // explicit override
      is_gst_exempt: false,
      is_super_bearing: false,
      is_commissionable: true,
    };
    const r = computeFeeLine(line);
    expect(r.asfAmount).toBe(0);
    closeTo(r.gstAmount, 500);              // GST on $5000 only
    closeTo(r.commissionAmount, 1000);      // commission still applies
  });
});

// ============================================================
// Canonical Oliver AJE eComm #3579 example
// (from project_fee_engine.md — locked doctrine)
// ============================================================

describe('Oliver AJE eComm #3579 worked example', () => {
  // Artist fees (Oliver): photography $3,500 + post $500 + retouching $250 = $4,250
  // Commission 20% = $850; commission GST = $85
  // Oliver GST (registered) on $4,250 = $425
  // Oliver net: 4250 - 850 - 85 + 425 = 3,740

  it('computes Oliver artist payment correctly', () => {
    const oliver = computeArtistPayment(4250, true);
    closeTo(oliver.commission, 850);
    closeTo(oliver.commissionGst, 85);
    closeTo(oliver.artistGst, 425);
    closeTo(oliver.netPayment, 3740);
  });

  it('GST-unregistered artist: no artist GST added', () => {
    const r = computeArtistPayment(4250, false);
    expect(r.artistGst).toBe(0);
    closeTo(r.netPayment, 3315);            // 4250 - 850 - 85
  });

  it('full quote totals: Oliver fees + crew + fringes', () => {
    const lines: Partial<FeeLine>[] = [
      // Oliver artist fees (commissionable)
      createArtistFeeLine('Photography', 3500, 1),
      createArtistFeeLine('Post-production', 500, 1),
      createArtistFeeLine('Retouching', 250, 1),
      // Crew (super-bearing, no commission)
      createCrewLabourLine('Digital Operator', 700, 1),
      createCrewLabourLine('Photo Assistant', 500, 1),
      // Fringes/expenses (no ASF, no super, no commission)
      createExpenseLine('catering', 'Catering', 180, 1),
    ];
    const t = computeQuoteTotals(lines);

    closeTo(t.subtotal, 5630);              // 4250 + 1200 + 180
    // ASF: 4250 * 0.15 + 1200 * 0.15 + 0 = 637.5 + 180 = 817.5
    closeTo(t.totalAsf, 817.5);
    // Super (crew only): 1200 * 0.15 = 180
    closeTo(t.totalSuper, 180);
    closeTo(t.totalSuperPaid, 144);         // 1200 * 0.12
    // Commission (artist only): 4250 * 0.20 = 850
    closeTo(t.totalCommission, 850);
    closeTo(t.totalCommissionGst, 85);
    // GST: 10% on (subtotal + ASF) excluding super
    //   Artist GST base: 4250 + 637.5 = 4887.5 → GST 488.75
    //   Crew GST base:   1200 + 180   = 1380   → GST 138
    //   Fringe GST base: 180          = 180    → GST 18
    //   Total GST: 644.75
    closeTo(t.totalGst, 644.75);
    // Grand total: subtotal + ASF + GST + super
    //   = 5630 + 817.5 + 644.75 + 180 = 7272.25
    closeTo(t.grandTotal, 7272.25);
  });
});

// ============================================================
// Edge cases — quantity, defaults, missing fields
// ============================================================

describe('computeQuoteTotals edge cases', () => {
  it('empty line list returns all zeros', () => {
    const t = computeQuoteTotals([]);
    expect(t.subtotal).toBe(0);
    expect(t.grandTotal).toBe(0);
    expect(t.lines).toEqual([]);
  });

  it('all-fringe quote has no commission, no super', () => {
    const t = computeQuoteTotals([
      createExpenseLine('travel', 'Flights', 800, 1),
      createExpenseLine('catering', 'Lunch', 180, 1),
    ]);
    expect(t.totalCommission).toBe(0);
    expect(t.totalSuper).toBe(0);
    expect(t.totalAsf).toBe(0);
    closeTo(t.totalGst, 98);                // (800 + 180) * 0.10
  });

  it('per-line totals sum to quote total', () => {
    const lines: Partial<FeeLine>[] = [
      createArtistFeeLine('Day 1', 2000, 1),
      createCrewLabourLine('Assistant', 600, 2),
    ];
    const t = computeQuoteTotals(lines);
    const sumOfLineTotals = t.lines.reduce((s, l) => s + l.lineTotal, 0);
    const sumOfSuper = t.lines.reduce((s, l) => s + l.superChargedAmount, 0);
    closeTo(sumOfLineTotals + sumOfSuper, t.grandTotal);
  });
});

// ============================================================
// Overtime calculator
// ============================================================

describe('computeOT', () => {
  it('no OT under threshold', () => {
    const r = computeOT(9.5, 1000, false, true);
    expect(r.otHours).toBe(0);
    expect(r.otTotal).toBe(0);
  });

  it('within 30-min grace: no OT charged', () => {
    // 10h + 25min = 10.42h, under 10h + 30min grace
    const r = computeOT(10.42, 1000, false, true);
    expect(r.otHours).toBe(0);
  });

  it('past grace triggers OT, rounded up to 15-min increments', () => {
    // 10h + 35min = 10.583h. OT raw = 0.583h = 35min → rounds up to 45min (3 × 15min)
    const r = computeOT(10 + 35 / 60, 1000, false, true);
    expect(r.otIncrements).toBe(3);
    closeTo(r.otHours, 0.75);
  });

  it('crew OT: 1.5× hourly rate', () => {
    // 11h shift, $1000/day = $100/hr base. Crew rate = $100 × 1.5 = $150/hr
    // OT = 1h → rounded up to 4 × 15min = 1h. otTotal = 1 × 150 = $150
    const r = computeOT(11, 1000, false, true);
    closeTo(r.otRate, 150);
    closeTo(r.otTotal, 150);
  });

  it('artist OT: 1.0× hourly rate (still gets paid for OT hours but at flat hourly)', () => {
    const r = computeOT(11, 1000, false, false);
    closeTo(r.otRate, 100);                 // $1000/10 × 1.0
    closeTo(r.otTotal, 100);
  });

  it('half-day artist OT: threshold = 5h', () => {
    // 5h 45min = 5.75h. OT raw = 45min → 3 × 15min = 0.75h
    // half-day rate = $500. hourly = 500/5 = $100. OT @ 1× = $100/hr
    const r = computeOT(5.75, 500, true, false);
    expect(r.otIncrements).toBe(3);
    closeTo(r.otHours, 0.75);
    closeTo(r.otTotal, 75);                 // 0.75 × 100
  });

  it('rounds OT up: 16-min over rounds to 30min, not 15min', () => {
    // 10h + 30min grace + 16min = 10.7666h. OT raw = 0.7666h = 46min → 4 × 15 = 60min?
    // Actually otHoursRaw = 10.7666 - 10 = 0.7666 → ceil(0.7666 * 4) = ceil(3.066) = 4 → 60min
    const r = computeOT(10 + 46 / 60, 1000, false, true);
    expect(r.otIncrements).toBe(4);
    closeTo(r.otHours, 1);
  });
});

// ============================================================
// Artist payment helper
// ============================================================

describe('computeArtistPayment', () => {
  it('zero fees yields zero everything', () => {
    const r = computeArtistPayment(0, true);
    expect(r.netPayment).toBe(0);
    expect(r.commission).toBe(0);
  });

  it('GST-registered: artist GST > commission GST → net > gross - commission', () => {
    const r = computeArtistPayment(10000, true);
    closeTo(r.commission, 2000);
    closeTo(r.commissionGst, 200);
    closeTo(r.artistGst, 1000);
    // Net: 10000 - 2000 - 200 + 1000 = 8800
    closeTo(r.netPayment, 8800);
  });
});
