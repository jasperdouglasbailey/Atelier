/**
 * Atelier Fee Engine — Australian photo agency billing
 *
 * Rules (locked doctrine):
 * - Commission: 20% on artist labour only. Excludes EQ and reimbursables.
 * - ASF (Agency Service Fee): 15% default, adjustable 0–15% per line, on all lines except super.
 * - Super (crew only): charged to client at 15%, paid to fund at 12%. GST-free. No ASF on super.
 * - GST: 10% on all lines except super.
 * - Day rate: Full = ≤10h, Half = ≤5h (artists only — crew full day only).
 * - OT triggers 30min past threshold. Artist OT = 1×, Crew OT = 1.5×. Billed in 15min increments, rounded up.
 * - Pay-on-paid: artist/crew remitted after client payment clears.
 */

import type { FeeLine, FeeLineType } from '@/lib/types/database';
import {
  DEFAULT_COMMISSION_RATE, DEFAULT_ASF_RATE, GST_RATE,
  SUPER_RATE_CHARGED, SUPER_RATE_PAID,
  FULL_DAY_HOURS, HALF_DAY_HOURS, OT_GRACE_MINUTES,
  ARTIST_OT_MULTIPLIER, CREW_OT_MULTIPLIER, OT_INCREMENT_MINUTES,
} from '@/lib/utils/constants';

// ============================================================
// Helpers
// ============================================================

/** Round to 2 decimal places (financial rounding). */
function r2(n: number): number {
  return Math.round(n * 100) / 100;
}


// ============================================================
// Compute a single fee line
// ============================================================

export interface ComputedFeeLine {
  subtotal: number;
  asfAmount: number;
  gstAmount: number;
  superChargedAmount: number; // what client pays (15%)
  superPaidAmount: number;   // what goes to fund (12%)
  commissionAmount: number;  // agency keeps from artist
  commissionGst: number;     // GST on commission
  lineTotal: number;         // subtotal + ASF + GST (super added separately)
}

export function computeFeeLine(line: Partial<FeeLine>): ComputedFeeLine {
  const qty = line.quantity ?? 1;
  const price = line.unit_price ?? 0;
  const subtotal = r2(qty * price);

  // ASF: applied to the subtotal. Rate is per-line adjustable.
  const asfRate = line.asf_rate ?? DEFAULT_ASF_RATE;
  const asfAmount = r2(subtotal * asfRate);

  // GST: 10% on (subtotal + ASF). Super lines are GST-exempt.
  const gstBase = subtotal + asfAmount;
  const gstAmount = line.is_gst_exempt ? 0 : r2(gstBase * GST_RATE);

  // Super (crew labour only): charged at 15% of crew labour subtotal. No GST, no ASF on super.
  const superChargedRate = line.super_rate_charged ?? SUPER_RATE_CHARGED;
  const superPaidRate = line.super_rate_paid ?? SUPER_RATE_PAID;
  const superChargedAmount = line.is_super_bearing ? r2(subtotal * superChargedRate) : 0;
  const superPaidAmount = line.is_super_bearing ? r2(subtotal * superPaidRate) : 0;

  // Commission: 20% on artist labour subtotal (agency retains at payment time)
  const commRate = line.commission_rate ?? DEFAULT_COMMISSION_RATE;
  const commissionAmount = line.is_commissionable ? r2(subtotal * commRate) : 0;
  const commissionGst = line.is_commissionable ? r2(commissionAmount * GST_RATE) : 0;

  // Line total for client invoice: subtotal + ASF + GST (super added separately on the invoice)
  const lineTotal = r2(subtotal + asfAmount + gstAmount);

  return {
    subtotal, asfAmount, gstAmount,
    superChargedAmount, superPaidAmount,
    commissionAmount, commissionGst,
    lineTotal,
  };
}

// ============================================================
// Compute quote totals from a set of fee lines
// ============================================================

export interface QuoteTotals {
  subtotal: number;
  totalAsf: number;
  totalGst: number;
  totalSuper: number;       // charged to client (15%)
  totalSuperPaid: number;   // paid to fund (12%)
  grandTotal: number;       // subtotal + ASF + GST + super (client pays this)
  totalCommission: number;  // agency retains from artist payments
  totalCommissionGst: number;
  lines: ComputedFeeLine[];
}

export function computeQuoteTotals(lines: Partial<FeeLine>[]): QuoteTotals {
  const computed = lines.map(computeFeeLine);

  const subtotal = r2(computed.reduce((s, l) => s + l.subtotal, 0));
  const totalAsf = r2(computed.reduce((s, l) => s + l.asfAmount, 0));
  const totalGst = r2(computed.reduce((s, l) => s + l.gstAmount, 0));
  const totalSuper = r2(computed.reduce((s, l) => s + l.superChargedAmount, 0));
  const totalSuperPaid = r2(computed.reduce((s, l) => s + l.superPaidAmount, 0));
  const grandTotal = r2(subtotal + totalAsf + totalGst + totalSuper);
  const totalCommission = r2(computed.reduce((s, l) => s + l.commissionAmount, 0));
  const totalCommissionGst = r2(computed.reduce((s, l) => s + l.commissionGst, 0));

  return {
    subtotal, totalAsf, totalGst, totalSuper, totalSuperPaid,
    grandTotal, totalCommission, totalCommissionGst, lines: computed,
  };
}

// ============================================================
// Agency margin (gross revenue retained on the booking)
// ============================================================

export interface AgencyMargin {
  commission: number;       // 20% commission on artist labour
  asf: number;              // ASF charged to client (default 15%)
  superSpread: number;      // 3% retained on crew super (charged 15%, paid 12%)
  total: number;            // commission + asf + superSpread
}

/**
 * Compute the agency's gross margin from a fee-line summary.
 * This is what Saunders & Co retains, before operating costs and tax.
 *
 * Components:
 *   - 20% commission on artist labour (paid out of the artist's gross)
 *   - ASF (default 15%) charged to the client on top of line subtotals
 *   - 3% spread on crew super (15% charged − 12% paid to fund)
 *
 * GST flows through — not part of margin.
 */
export function computeAgencyMargin(totals: QuoteTotals): AgencyMargin {
  const commission = totals.totalCommission;
  const asf = totals.totalAsf;
  const superSpread = r2(totals.totalSuper - totals.totalSuperPaid);
  const total = r2(commission + asf + superSpread);
  return { commission, asf, superSpread, total };
}

// ============================================================
// GST passthrough — what the agency owes the ATO on this booking
// ============================================================
// The agency is GST-registered, so it:
//   - charges 10% GST to the client on every line (including commission)
//   - pays GST on top of fees to GST-registered talent and crew
//   - claims those payments back as input tax credits at BAS time
// Net GST liability = collected − input credits.
//
// This is presentation-only — the actual BAS is run from Xero, not from
// this booking. The point of the panel is to make it obvious to Jasper
// what's a passthrough vs what's actually agency margin.

export interface GstPassthrough {
  /** GST charged on artist + outgoing fee lines (already in totals.totalGst). */
  collectedOnLines: number;
  /** GST charged on agency commission (also collected from client). */
  collectedOnCommission: number;
  /** Total GST collected from client this booking. */
  collectedTotal: number;
  /** Input credits — GST paid through to GST-registered talent. */
  artistInputCredits: number;
  /** Input credits — GST paid through to GST-registered crew. */
  crewInputCredits: number;
  /** Total input credits this booking generates. */
  inputCreditsTotal: number;
  /** Net liability to the ATO (collected − input credits). */
  netToAto: number;
}

/**
 * Compute the GST passthrough picture for a booking.
 *
 * `artistFeeSubtotal` and `crewLabourSubtotal` are the gross labour
 * subtotals. `artistsGstRegistered` and `crewGstRegisteredCount` /
 * `crewGstRegisteredSubtotal` describe what fraction of those payouts
 * actually generates input credits.
 *
 * For simplicity we treat GST-registered talent/crew as receiving GST on
 * their full labour subtotal — the same way the artist payment / crew RCTI
 * helpers above do. Outgoings (equipment, studio etc.) almost always come
 * with GST too, but those are billed straight to the agency by external
 * vendors, not through this fee-line table — they're not modelled here.
 */
export function computeGstPassthrough(args: {
  totals: QuoteTotals;
  artistFeeSubtotal: number;
  artistGstRegistered: boolean;
  crewLabourSubtotalGstRegistered: number;
}): GstPassthrough {
  const { totals, artistFeeSubtotal, artistGstRegistered, crewLabourSubtotalGstRegistered } = args;

  const collectedOnLines = totals.totalGst;
  const collectedOnCommission = totals.totalCommissionGst;
  const collectedTotal = r2(collectedOnLines + collectedOnCommission);

  const artistInputCredits = artistGstRegistered ? r2(artistFeeSubtotal * GST_RATE) : 0;
  const crewInputCredits = r2(crewLabourSubtotalGstRegistered * GST_RATE);
  const inputCreditsTotal = r2(artistInputCredits + crewInputCredits);

  const netToAto = r2(collectedTotal - inputCreditsTotal);

  return {
    collectedOnLines, collectedOnCommission, collectedTotal,
    artistInputCredits, crewInputCredits, inputCreditsTotal, netToAto,
  };
}

// ============================================================
// Artist net payment calculator
// ============================================================

export interface ArtistPayment {
  grossFees: number;       // sum of artist fee lines
  commission: number;      // 20% of grossFees
  commissionGst: number;   // GST on commission
  artistGst: number;       // GST the artist charges (if GST registered)
  netPayment: number;      // grossFees - commission - commissionGst + artistGst
}

export function computeArtistPayment(
  artistFeeSubtotal: number,
  isGstRegistered: boolean,
): ArtistPayment {
  const commission = r2(artistFeeSubtotal * DEFAULT_COMMISSION_RATE);
  const commissionGst = r2(commission * GST_RATE);
  const artistGst = isGstRegistered ? r2(artistFeeSubtotal * GST_RATE) : 0;
  const netPayment = r2(artistFeeSubtotal - commission - commissionGst + artistGst);

  return { grossFees: artistFeeSubtotal, commission, commissionGst, artistGst, netPayment };
}

// ============================================================
// Crew payment / RCTI calculator
// ============================================================
// What the crew member is paid by the agency. Per AU doctrine:
// - Super at 12% paid to fund (15% charged to client; 3% margin retained as
//   admin cost — that 3% does NOT appear on the crew bill).
// - GST on labour subtotal only (if crew is GST registered). NOT on super.
// - No commission on crew (commission is artist-only).

export interface CrewPayment {
  labourSubtotal: number;    // crew_labour + overtime + travel — the wages
  expensesSubtotal: number;  // crew_equipment / reimbursables they paid for and are billing back
  superPaid: number;         // 12% of labourSubtotal — goes to fund
  gst: number;               // 10% on (labourSubtotal + expensesSubtotal) if GST registered
  netPayment: number;        // labour + expenses + super + GST
}

export function computeCrewPayment(
  labourSubtotal: number,
  expensesSubtotal: number,
  isGstRegistered: boolean,
): CrewPayment {
  const superPaid = r2(labourSubtotal * SUPER_RATE_PAID);
  // GST on labour + expenses, NEVER on super (super is GST-free in AU)
  const gst = isGstRegistered ? r2((labourSubtotal + expensesSubtotal) * GST_RATE) : 0;
  const netPayment = r2(labourSubtotal + expensesSubtotal + superPaid + gst);
  return { labourSubtotal, expensesSubtotal, superPaid, gst, netPayment };
}

// ============================================================
// OT calculator
// ============================================================

export interface OTResult {
  otHours: number;
  otRate: number;
  otTotal: number;
  otIncrements: number; // number of 15-min increments
}

export function computeOT(
  actualHours: number,
  dayRate: number,
  isHalfDay: boolean,
  isCrewMember: boolean,
): OTResult {
  const threshold = isHalfDay ? HALF_DAY_HOURS : FULL_DAY_HOURS;
  const graceHours = OT_GRACE_MINUTES / 60;

  if (actualHours <= threshold + graceHours) {
    return { otHours: 0, otRate: 0, otTotal: 0, otIncrements: 0 };
  }

  const otHoursRaw = actualHours - threshold;
  // Round up to nearest 15-min increment
  const otIncrements = Math.ceil(otHoursRaw * (60 / OT_INCREMENT_MINUTES));
  const otHours = r2(otIncrements * (OT_INCREMENT_MINUTES / 60));

  const hourlyRate = dayRate / (isHalfDay ? HALF_DAY_HOURS : FULL_DAY_HOURS);
  const multiplier = isCrewMember ? CREW_OT_MULTIPLIER : ARTIST_OT_MULTIPLIER;
  const otRate = r2(hourlyRate * multiplier);
  const otTotal = r2(otHours * otRate);

  return { otHours, otRate, otTotal, otIncrements };
}

// ============================================================
// Fee line factory helpers
// ============================================================

export function createArtistFeeLine(
  description: string,
  unitPrice: number,
  quantity = 1,
  asfRate = DEFAULT_ASF_RATE,
): Partial<FeeLine> {
  return {
    line_type: 'artist_fee',
    description,
    quantity,
    unit_price: unitPrice,
    asf_rate: asfRate,
    is_gst_exempt: false,
    is_super_bearing: false,
    is_commissionable: true,
    commission_rate: DEFAULT_COMMISSION_RATE,
  };
}

export function createCrewLabourLine(
  description: string,
  unitPrice: number,
  quantity = 1,
  asfRate = DEFAULT_ASF_RATE,
): Partial<FeeLine> {
  return {
    line_type: 'crew_labour',
    description,
    quantity,
    unit_price: unitPrice,
    asf_rate: asfRate,
    is_gst_exempt: false,
    is_super_bearing: true,
    super_rate_charged: SUPER_RATE_CHARGED,
    super_rate_paid: SUPER_RATE_PAID,
    is_commissionable: false,
  };
}

export function createExpenseLine(
  lineType: FeeLineType,
  description: string,
  unitPrice: number,
  quantity = 1,
  asfRate = 0, // fringes/expenses typically no ASF
): Partial<FeeLine> {
  return {
    line_type: lineType,
    description,
    quantity,
    unit_price: unitPrice,
    asf_rate: asfRate,
    is_gst_exempt: false,
    is_super_bearing: false,
    is_commissionable: false,
  };
}

// ============================================================
// Verification: Oliver AJE eComm #3579 canonical example
// ============================================================
// Use computeQuoteTotals + computeArtistPayment against the canonical
// worked example to verify the engine. See project_fee_engine.md.
//
// Oliver fees: $3,500 + $500 + $250 = $4,250
// Commission: 20% × $4,250 = $850
// Commission GST: 10% × $850 = $85
// Oliver GST: 10% × $4,250 = $425
// Oliver net: $4,250 - $850 - $85 + $425 = $3,740
//
// Crew: digi op $700 (ASF $105), assistant $500 (ASF $75), fringes $180 (no ASF)
// Client invoice: $6,830 subtotal + $817.50 ASF + $746.75 GST = $8,394.25
