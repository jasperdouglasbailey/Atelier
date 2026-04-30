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

// Fee line types that are artist labour (commissionable)
const ARTIST_LABOUR_TYPES: FeeLineType[] = [
  'artist_fee', 'usage_licence', 'file_management', 'retouching', 'post_production',
];

// Fee line types that are crew labour (super-bearing)
const CREW_LABOUR_TYPES: FeeLineType[] = ['crew_labour', 'overtime'];

// Super-bearing includes crew labour + travel (when it's crew travel)
const SUPER_BEARING_TYPES: FeeLineType[] = ['crew_labour', 'overtime', 'travel'];

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
