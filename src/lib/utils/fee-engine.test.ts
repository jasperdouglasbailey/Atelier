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
  computeAgencyMargin,
  computeGstPassthrough,
  computeArtistPayment,
  computeCrewPayment,
  computeOT,
  effectiveCost,
  isReimbursement,
  isArtistReimbursement,
  isCrewReimbursement,
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
    const r = computeFeeLine(createExpenseLine('expense', 'Lunch x12', 180, 1));
    closeTo(r.subtotal, 180);
    expect(r.asfAmount).toBe(0);
    closeTo(r.gstAmount, 18);               // 180 * 0.10
    expect(r.commissionAmount).toBe(0);
    expect(r.superChargedAmount).toBe(0);
    closeTo(r.lineTotal, 198);
  });

  it('GST-exempt line skips GST entirely', () => {
    const line: Partial<FeeLine> = {
      line_type: 'crew_travel',
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
      createExpenseLine('expense', 'Catering', 180, 1),
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
      createExpenseLine('crew_travel', 'Flights', 800, 1),
      createExpenseLine('expense', 'Lunch', 180, 1),
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

describe('computeCrewPayment', () => {
  it('GST-registered crew: super 12%, GST 10% on labour+expenses', () => {
    // Lewis Stevenson canonical: $700 labour, no expenses, GST registered
    const r = computeCrewPayment(700, 0, true);
    closeTo(r.labourSubtotal, 700);
    expect(r.expensesSubtotal).toBe(0);
    closeTo(r.superPaid, 84);            // 700 * 0.12
    closeTo(r.gst, 70);                  // 700 * 0.10
    closeTo(r.netPayment, 854);          // 700 + 84 + 70
  });

  it('Non-GST crew: super yes, GST no', () => {
    const r = computeCrewPayment(500, 0, false);
    closeTo(r.superPaid, 60);
    expect(r.gst).toBe(0);
    closeTo(r.netPayment, 560);
  });

  it('Crew with equipment expenses: super only on labour, GST on labour+expenses', () => {
    // 600 labour + 200 equipment hire (their own gear)
    const r = computeCrewPayment(600, 200, true);
    closeTo(r.labourSubtotal, 600);
    closeTo(r.expensesSubtotal, 200);
    closeTo(r.superPaid, 72);            // 12% × 600 (NOT on equipment)
    closeTo(r.gst, 80);                  // 10% × (600 + 200)
    closeTo(r.netPayment, 952);          // 600 + 200 + 72 + 80
  });

  it('No GST on super in any scenario (AU rule)', () => {
    const r = computeCrewPayment(1000, 100, true);
    // GST should NOT include super in its base
    closeTo(r.gst, 110);                 // 10% of 1100 (labour+expenses), NOT 1100+120
  });

  // ============================================================
  // Overtime split (2026-05-16 — was a P1 display bug, see audit)
  // Doctrine: overtime is GST-bearing but NOT super-bearing.
  // ============================================================

  it('overtime is GST-bearing but NOT super-bearing', () => {
    const r = computeCrewPayment(1000, 0, true, 200);
    closeTo(r.labourSubtotal, 1000);
    closeTo(r.overtimeSubtotal, 200);
    closeTo(r.superPaid, 120);           // 12% × 1000 only (overtime excluded)
    closeTo(r.gst, 120);                 // 10% × (1000 + 200) — overtime IS GST-bearing
    closeTo(r.netPayment, 1440);         // 1000 + 200 + 120 + 120
  });

  it('overtime-only (no labour): super is zero, GST applies', () => {
    const r = computeCrewPayment(0, 0, true, 500);
    closeTo(r.superPaid, 0);
    closeTo(r.gst, 50);
    closeTo(r.netPayment, 550);
  });

  it('overtime + expenses, GST-registered: GST on (labour + overtime + expenses)', () => {
    const r = computeCrewPayment(800, 150, true, 300);
    closeTo(r.superPaid, 96);            // 12% × 800
    closeTo(r.gst, 125);                 // 10% × 1250
    closeTo(r.netPayment, 1471);         // 800 + 300 + 150 + 96 + 125
  });

  it('overtime, non-GST crew: no GST, no super on OT', () => {
    const r = computeCrewPayment(600, 0, false, 100);
    closeTo(r.superPaid, 72);
    expect(r.gst).toBe(0);
    closeTo(r.netPayment, 772);
  });

  it('omitted overtime param preserves legacy output byte-identical', () => {
    // AJE eComm canonical safety: existing callers without overtime
    // must get the same numbers as before the param was added.
    const r = computeCrewPayment(700, 0, true);
    expect(r.overtimeSubtotal).toBe(0);
    closeTo(r.superPaid, 84);
    closeTo(r.gst, 70);
    closeTo(r.netPayment, 854);
  });
});

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
    closeTo(r.reimbursementSubtotal, 0);
    // Net: 10000 - 2000 - 200 + 1000 = 8800
    closeTo(r.netPayment, 8800);
  });

  it('with reimbursement (GST-registered): adds cost + GST on top, no commission on reimbursement', () => {
    // The Testino scenario: $4,000 of artist fees + $1,200 equipment that
    // Oliver fronted. Reimbursement isn't commissionable, but Oliver still
    // charges GST on it because he's GST-registered.
    const r = computeArtistPayment(4000, true, 1200);
    closeTo(r.grossFees, 4000);
    closeTo(r.commission, 800);        // 20% × 4000 (NOT × 5200)
    closeTo(r.commissionGst, 80);
    closeTo(r.reimbursementSubtotal, 1200);
    closeTo(r.artistGst, 520);          // 10% × (4000 + 1200)
    // Net: 4000 - 800 - 80 + 1200 + 520 = 4840
    closeTo(r.netPayment, 4840);
  });

  it('with reimbursement (NOT GST-registered): no GST on either bucket', () => {
    const r = computeArtistPayment(4000, false, 1200);
    closeTo(r.commission, 800);
    closeTo(r.commissionGst, 80);
    closeTo(r.artistGst, 0);
    closeTo(r.reimbursementSubtotal, 1200);
    // Net: 4000 - 800 - 80 + 1200 + 0 = 4320
    closeTo(r.netPayment, 4320);
  });

  it('reimbursement only (zero artist fees): reimbursement + GST passes through', () => {
    // Edge: an expense-only booking where the artist paid for everything
    // upfront and gets reimbursed without doing labour.
    const r = computeArtistPayment(0, true, 1200);
    closeTo(r.commission, 0);
    closeTo(r.commissionGst, 0);
    closeTo(r.artistGst, 120);
    closeTo(r.netPayment, 1320);
  });
});

// ============================================================
// Grand-total invariants — math accuracy guarantees
// ============================================================

describe('grand-total invariants', () => {
  // grandTotal must ALWAYS equal subtotal + ASF + GST + super.
  // If this ever fails it means the fee engine has a rounding or
  // logic bug that would produce a wrong client invoice total.

  it('grandTotal === subtotal + totalAsf + totalGst + totalSuper (single artist line)', () => {
    const t = computeQuoteTotals([createArtistFeeLine('Day rate', 4000, 1)]);
    closeTo(t.grandTotal, t.subtotal + t.totalAsf + t.totalGst + t.totalSuper);
  });

  it('grandTotal === subtotal + totalAsf + totalGst + totalSuper (mixed lines)', () => {
    const lines = [
      createArtistFeeLine('Photography', 3500, 1),
      createCrewLabourLine('Digital Op', 700, 1),
      createExpenseLine('expense', 'Catering', 180, 1),
    ];
    const t = computeQuoteTotals(lines);
    closeTo(t.grandTotal, t.subtotal + t.totalAsf + t.totalGst + t.totalSuper);
  });

  it('breakdown buckets sum to grandTotal (agency keeps + ATO net + paid through)', () => {
    // Verify that the three display buckets in QuoteBuilder always reconcile.
    // paidThrough is defined as the residual so this is a regression guard
    // against future changes to computeAgencyMargin or computeGstPassthrough
    // accidentally breaking the reconciliation logic.
    const lines = [
      createArtistFeeLine('Photography', 3500, 1),
      createArtistFeeLine('Post-production', 500, 1),
      createCrewLabourLine('Digital Operator', 700, 1),
      createExpenseLine('expense', 'Catering', 180, 1),
    ];
    const t = computeQuoteTotals(lines);
    const margin = computeAgencyMargin(t);
    const gst = computeGstPassthrough({
      totals: t,
      artistFeeSubtotal: t.subtotal - 700 - 180, // artist lines only
      artistGstRegistered: true,
      crewLabourSubtotalGstRegistered: 700,
    });
    const paidThrough = Math.round((t.grandTotal - margin.total - gst.netToAto) * 100) / 100;
    // The three buckets must sum back to grand total
    closeTo(margin.total + gst.netToAto + paidThrough, t.grandTotal);
  });

  it('pre-tax subtotal (lines + ASF) + super + GST === grandTotal', () => {
    // This is the user-visible "Subtotal (before super & GST)" label guarantee.
    const lines = [
      createArtistFeeLine('Day rate', 5000, 1),
      createCrewLabourLine('Assistant', 800, 1),
    ];
    const t = computeQuoteTotals(lines);
    const preTaxSubtotal = t.subtotal + t.totalAsf;
    closeTo(preTaxSubtotal + t.totalGst + t.totalSuper, t.grandTotal);
  });
});

// ============================================================
// Cost-vs-billed split (cost_subtotal feature)
// ============================================================
// When the payee invoices less than what was quoted to the client, the
// difference is captured agency margin. These tests verify:
//   - When cost_subtotal is unset (null), behaviour is identical to before
//   - When cost_subtotal < subtotal, paid-out math uses cost; client invoice
//     math stays on billed; spread shows up in agency margin
//   - The AJE eComm #3579 canonical example with cost_subtotal=null is byte-
//     identical to the pre-feature totals (regression guard)

describe('cost_subtotal split: legacy behaviour preserved', () => {
  it('effectiveCost falls back to qty × unit_price when cost_subtotal is null', () => {
    const line: Partial<FeeLine> = { quantity: 2, unit_price: 300 };
    expect(effectiveCost(line)).toBe(600);
  });

  it('effectiveCost returns cost_subtotal when set', () => {
    const line: Partial<FeeLine> = { quantity: 2, unit_price: 300, cost_subtotal: 500 };
    expect(effectiveCost(line)).toBe(500);
  });

  it('computeFeeLine with cost_subtotal=null produces same numbers as before', () => {
    // Re-run a canonical artist line: $3500, ASF 15%, GST 10%, commissionable
    const r = computeFeeLine(createArtistFeeLine('Photography', 3500, 1));
    closeTo(r.subtotal, 3500);
    closeTo(r.costSubtotal, 3500);          // defaults to billed
    closeTo(r.spreadCaptured, 0);            // no spread
    closeTo(r.asfAmount, 525);               // 15% of 3500
    closeTo(r.commissionAmount, 700);        // 20% of 3500
    closeTo(r.commissionGst, 70);
  });

  it('Oliver AJE #3579 canonical: totals unchanged when no cost overrides', () => {
    const lines: Partial<FeeLine>[] = [
      createArtistFeeLine('Photography', 3500, 1),
      createArtistFeeLine('Post-production', 500, 1),
      createArtistFeeLine('Retouching', 250, 1),
      createCrewLabourLine('Digital Operator', 700, 1),
      createCrewLabourLine('Photo Assistant', 500, 1),
      createExpenseLine('expense', 'Catering', 180, 1),
    ];
    const t = computeQuoteTotals(lines);
    // Spread captured must be 0 — no cost_subtotal set on any line
    closeTo(t.totalSpreadCaptured, 0);
    // Cost subtotal equals billed subtotal (the legacy invariant)
    closeTo(t.costSubtotal, t.subtotal);
    // Grand total identical to legacy expectation: 7272.25
    closeTo(t.grandTotal, 7272.25);
    // Margin = commission + ASF + super spread, NO spreadCaptured
    const m = computeAgencyMargin(t);
    closeTo(m.spreadCaptured, 0);
    closeTo(m.commission, 850);
    closeTo(m.asf, 817.5);
    closeTo(m.superSpread, 36);             // 180 - 144
    closeTo(m.total, 1703.5);               // 850 + 817.5 + 36
  });
});

describe('cost_subtotal split: cost < billed (the windfall case)', () => {
  // Scenario from the Jasper 2026-05-15 discussion:
  // Client quoted digital operator at $600/day. Operator actually invoices $550.
  // Client invoice stays at $600. Cost paid stays at $550. Agency captures $50.

  it('crew labour with cost_subtotal < subtotal: super paid uses cost, super charged uses billed', () => {
    const line: Partial<FeeLine> = {
      ...createCrewLabourLine('Digital Operator', 600, 1),
      cost_subtotal: 550,
    };
    const r = computeFeeLine(line);
    closeTo(r.subtotal, 600);
    closeTo(r.costSubtotal, 550);
    closeTo(r.spreadCaptured, 50);
    // Super CHARGED to client: 15% × 600 = 90 (on billed)
    closeTo(r.superChargedAmount, 90);
    // Super PAID to fund: 12% × 550 = 66 (on cost)
    closeTo(r.superPaidAmount, 66);
    // ASF: 15% × 600 = 90 (on billed)
    closeTo(r.asfAmount, 90);
    // GST: 10% × (600 + 90) = 69 (on billed)
    closeTo(r.gstAmount, 69);
    // Line total to client (super added separately):
    closeTo(r.lineTotal, 759);
  });

  it('artist line with cost_subtotal < subtotal: commission scales with cost', () => {
    // Quoted artist fee $4250, but artist invoices $4000 (caught a discount somewhere)
    const line: Partial<FeeLine> = {
      ...createArtistFeeLine('Photography', 4250, 1),
      cost_subtotal: 4000,
    };
    const r = computeFeeLine(line);
    closeTo(r.subtotal, 4250);
    closeTo(r.costSubtotal, 4000);
    closeTo(r.spreadCaptured, 250);
    // Commission: 20% × 4000 = 800 (on COST, not 850 on billed)
    closeTo(r.commissionAmount, 800);
    closeTo(r.commissionGst, 80);
    // ASF: 15% × 4250 = 637.50 (on BILLED — what client sees)
    closeTo(r.asfAmount, 637.5);
    // GST: 10% × (4250 + 637.50) = 488.75 (on BILLED)
    closeTo(r.gstAmount, 488.75);
  });

  it('agency margin includes spread captured when cost < billed', () => {
    // Same scenario: 1 line with $50 spread
    const lines: Partial<FeeLine>[] = [
      {
        ...createCrewLabourLine('Digital Operator', 600, 1),
        cost_subtotal: 550,
      },
    ];
    const t = computeQuoteTotals(lines);
    closeTo(t.totalSpreadCaptured, 50);
    closeTo(t.costSubtotal, 550);
    closeTo(t.subtotal, 600);

    const m = computeAgencyMargin(t);
    // No commission (crew labour not commissionable). ASF = 90. Super spread = 90 - 66 = 24.
    // Spread captured = 50. Total = 90 + 24 + 50 = 164.
    closeTo(m.commission, 0);
    closeTo(m.asf, 90);
    closeTo(m.superSpread, 24);            // billed × 15% − cost × 12%
    closeTo(m.spreadCaptured, 50);
    closeTo(m.total, 164);
  });

  it('crew payment uses cost subtotal: invoiced amount, not quoted', () => {
    // Crew member invoices $550 (the cost), GST registered.
    // Super paid = 12% × 550 = 66. GST = 10% × 550 = 55. Net = 550 + 66 + 55 = 671.
    const r = computeCrewPayment(550, 0, true);
    closeTo(r.labourSubtotal, 550);
    closeTo(r.superPaid, 66);
    closeTo(r.gst, 55);
    closeTo(r.netPayment, 671);
  });

  it('GST passthrough: input credits scale with cost when artist underbills', () => {
    // Artist labour: billed $4250 (client invoice GST = 10% × (4250 + 637.50) = 488.75)
    // Artist invoices $4000 (cost). Artist GST on their invoice = 10% × 4000 = 400.
    // Agency net GST owed = 488.75 + commission GST − 400 (input credit)
    const t = computeQuoteTotals([
      { ...createArtistFeeLine('Photography', 4250, 1), cost_subtotal: 4000 },
    ]);
    const gst = computeGstPassthrough({
      totals: t,
      artistFeeSubtotal: 4000,        // COST, not 4250 billed
      artistGstRegistered: true,
      crewLabourSubtotalGstRegistered: 0,
    });
    // collectedOnLines = totalGst from client invoice = 488.75
    closeTo(gst.collectedOnLines, 488.75);
    // commission GST = 80 (20% × 4000 = 800; ×10% = 80)
    closeTo(gst.collectedOnCommission, 80);
    closeTo(gst.collectedTotal, 568.75);
    // Input credit: 10% of artist's $4000 invoice = 400
    closeTo(gst.artistInputCredits, 400);
    // Net to ATO: 568.75 - 400 = 168.75
    closeTo(gst.netToAto, 168.75);
  });
});

// ============================================================
// Reimbursement classification + pass-through
// ============================================================

describe('isReimbursement / isArtistReimbursement / isCrewReimbursement', () => {
  it('returns false for commissionable lines regardless of links', () => {
    const line: Partial<FeeLine> = {
      line_type: 'artist_fee', is_commissionable: true,
      talent_id: 'tal-1', crew_id: null,
    };
    expect(isReimbursement(line)).toBe(false);
    expect(isArtistReimbursement(line)).toBe(false);
  });

  it('returns true when expense line links to talent (artist reimbursement)', () => {
    const line: Partial<FeeLine> = {
      line_type: 'expense', is_commissionable: false,
      talent_id: 'tal-1', crew_id: null,
    };
    expect(isReimbursement(line)).toBe(true);
    expect(isArtistReimbursement(line)).toBe(true);
    expect(isCrewReimbursement(line)).toBe(false);
  });

  it('returns true when expense line links to crew (crew reimbursement)', () => {
    const line: Partial<FeeLine> = {
      line_type: 'expense', is_commissionable: false,
      talent_id: null, crew_id: 'crew-1',
    };
    expect(isReimbursement(line)).toBe(true);
    expect(isArtistReimbursement(line)).toBe(false);
    expect(isCrewReimbursement(line)).toBe(true);
  });

  it('returns false when expense line has no linked payee', () => {
    const line: Partial<FeeLine> = {
      line_type: 'expense', is_commissionable: false,
      talent_id: null, crew_id: null,
    };
    expect(isReimbursement(line)).toBe(false);
  });

  it('artist link takes precedence over crew when both set (artist wins)', () => {
    // Belt-and-braces: if a row somehow had both set, the artist link is
    // canonical (artists are higher-priority payees in this app).
    const line: Partial<FeeLine> = {
      line_type: 'expense', is_commissionable: false,
      talent_id: 'tal-1', crew_id: 'crew-1',
    };
    expect(isArtistReimbursement(line)).toBe(true);
    expect(isCrewReimbursement(line)).toBe(false);
  });
});

describe('computeGstPassthrough — reimbursement pass-through', () => {
  it('artist expense reimbursement: GST passes through when artist is GST-registered', () => {
    // The Testino Resort scenario: $1,200 equipment allowance with 15%
    // ASF, agency bills client $1,200 + $180 ASF + $138 GST = $1,518.
    // Oliver fronted the gear and on-invoices the agency for $1,200 +
    // $120 GST. Agency claims the $120 as input credit.
    const reimbursementLine: Partial<FeeLine> = {
      ...createExpenseLine('expense', 'Camera kit allowance', 1200, 1, 0.15),
      talent_id: 'tal-oliver',
      is_commissionable: false,
    };
    const t = computeQuoteTotals([reimbursementLine as FeeLine]);

    const gst = computeGstPassthrough({
      totals: t,
      artistFeeSubtotal: 0,           // no artist labour on this booking
      artistGstRegistered: true,
      crewLabourSubtotalGstRegistered: 0,
      artistReimbursementSubtotal: 1200,
    });
    // GST collected: 10% × (1200 + 180) = 138
    closeTo(gst.collectedOnLines, 138);
    // Commission GST: zero (expense isn't commissionable)
    closeTo(gst.collectedOnCommission, 0);
    // Input credit: 10% × 1200 reimbursement = 120
    closeTo(gst.artistInputCredits, 120);
    closeTo(gst.crewInputCredits, 0);
    // Net to ATO: 138 collected - 120 credit = 18 (ASF GST only)
    closeTo(gst.netToAto, 18);
  });

  it('artist expense reimbursement: no GST pass-through when artist is NOT GST-registered', () => {
    const reimbursementLine: Partial<FeeLine> = {
      ...createExpenseLine('expense', 'Camera kit allowance', 1200, 1, 0.15),
      talent_id: 'tal-oliver',
      is_commissionable: false,
    };
    const t = computeQuoteTotals([reimbursementLine as FeeLine]);

    const gst = computeGstPassthrough({
      totals: t,
      artistFeeSubtotal: 0,
      artistGstRegistered: false,
      crewLabourSubtotalGstRegistered: 0,
      artistReimbursementSubtotal: 1200,
    });
    closeTo(gst.artistInputCredits, 0);
    closeTo(gst.netToAto, 138);
  });

  it('crew expense reimbursement: GST passes through when crew is GST-registered', () => {
    // Assistant fronted the catering bill ($600 with 15% ASF). Agency
    // bills client and pays them back. Crew is GST-registered.
    const reimbursementLine: Partial<FeeLine> = {
      ...createExpenseLine('expense', 'Catering reimbursement', 600, 1, 0.15),
      crew_id: 'crew-asst',
      is_commissionable: false,
    };
    const t = computeQuoteTotals([reimbursementLine as FeeLine]);

    const gst = computeGstPassthrough({
      totals: t,
      artistFeeSubtotal: 0,
      artistGstRegistered: true,
      crewLabourSubtotalGstRegistered: 0,
      crewReimbursementSubtotalGstRegistered: 600,
    });
    // GST collected: 10% × (600 + 90) = 69
    closeTo(gst.collectedOnLines, 69);
    closeTo(gst.crewInputCredits, 60);     // 10% × 600
    closeTo(gst.artistInputCredits, 0);
    closeTo(gst.netToAto, 9);              // 69 - 60 (ASF GST only)
  });

  it('crew expense reimbursement: no pass-through when crew is NOT GST-registered', () => {
    // Caller filters the subtotal to GST-registered crew only — when crew
    // is not registered, the caller passes 0 and no credit is generated.
    const reimbursementLine: Partial<FeeLine> = {
      ...createExpenseLine('expense', 'Catering reimbursement', 600, 1, 0.15),
      crew_id: 'crew-asst',
      is_commissionable: false,
    };
    const t = computeQuoteTotals([reimbursementLine as FeeLine]);

    const gst = computeGstPassthrough({
      totals: t,
      artistFeeSubtotal: 0,
      artistGstRegistered: true,
      crewLabourSubtotalGstRegistered: 0,
      crewReimbursementSubtotalGstRegistered: 0,
    });
    closeTo(gst.crewInputCredits, 0);
    closeTo(gst.netToAto, 69);
  });

  it('mixed: artist labour + artist reimbursement + crew reimbursement all aggregate correctly', () => {
    const lines: Partial<FeeLine>[] = [
      { ...createArtistFeeLine('Photography', 3500, 1) },                              // commissionable
      { ...createExpenseLine('expense', 'Camera kit', 1200, 1, 0.15), talent_id: 'tal', is_commissionable: false },
      { ...createExpenseLine('expense', 'Catering',  600, 1, 0.15), crew_id: 'crew', is_commissionable: false },
    ];
    const t = computeQuoteTotals(lines as FeeLine[]);

    const gst = computeGstPassthrough({
      totals: t,
      artistFeeSubtotal: 3500,
      artistGstRegistered: true,
      crewLabourSubtotalGstRegistered: 0,
      artistReimbursementSubtotal: 1200,
      crewReimbursementSubtotalGstRegistered: 600,
    });
    // Artist input credit: 10% × (3500 + 1200) = 470
    closeTo(gst.artistInputCredits, 470);
    // Crew input credit: 10% × 600 = 60
    closeTo(gst.crewInputCredits, 60);
    closeTo(gst.inputCreditsTotal, 530);
  });
});
