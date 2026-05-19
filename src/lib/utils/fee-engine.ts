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
  /** Billed to client. Drives client-invoice math (ASF, GST, super charged, line total). */
  subtotal: number;
  /**
   * Actually paid to the payee. Same as subtotal unless `cost_subtotal` was set
   * on the line (the "I quoted X but they invoiced Y" case). Drives the
   * paid-out side of the engine: commission, super to fund, input credits.
   */
  costSubtotal: number;
  /** subtotal − costSubtotal. Captured agency windfall (≥ 0). */
  spreadCaptured: number;
  asfAmount: number;
  gstAmount: number;
  superChargedAmount: number; // what client pays (15% of billed)
  superPaidAmount: number;   // what goes to fund (12% of COST)
  commissionAmount: number;  // agency keeps from artist (20% of COST when commissionable)
  commissionGst: number;     // GST on commission
  lineTotal: number;         // subtotal + ASF + GST (super added separately)
}

/** What's actually paid out for this line — `cost_subtotal` when set, else `subtotal`. */
export function effectiveCost(line: Partial<FeeLine>): number {
  if (line.cost_subtotal != null) return r2(line.cost_subtotal);
  const qty = line.quantity ?? 1;
  const price = line.unit_price ?? 0;
  return r2(qty * price);
}

/**
 * Is this line a reimbursement to the linked person (talent OR crew)?
 *
 * Doctrine (extended 2026-05-19): a fee line is a reimbursement IFF
 * it has a `talent_id` OR a `crew_id` linked AND it isn't
 * commissionable. The standalone `is_artist_reimbursement` boolean
 * column is retained for backward compatibility but no longer used as
 * a source of truth — the link itself IS the reimbursement signal.
 *
 * Real-world examples this enables:
 *   - Artist pays for their own gear, agency on-charges to client and
 *     passes through (Jasper's typical flow for Oliver). Line type
 *     `expense`, talent_id linked.
 *   - Crew member fronts the catering bill on shoot day, agency pays
 *     them back via this line. Line type `expense`, crew_id linked.
 *
 * Replaces the previous half-state where you could set the flag without
 * linking a person, or link a person without flagging — both of which
 * caused real data-integrity bugs (the 2 orphan reimbursements stripped
 * in migration 0060 were exactly this class).
 */
export function isReimbursement(line: Partial<FeeLine>): boolean {
  // Reimbursement = a cost the artist/crew paid up front that we on-bill to
  // the client at cost. Only `expense` lines qualify. crew_labour is also
  // non-commissionable + crew-linked but it's a SERVICE payment, not a
  // reimbursement — counting it here double-booked the line in JobPnL +
  // accounting (once in the crew bucket, once in the reimb bucket).
  if (line.line_type !== 'expense') return false;
  if (line.is_commissionable) return false;
  return line.talent_id != null || line.crew_id != null;
}

/** Narrower helper: artist reimbursement specifically. */
export function isArtistReimbursement(line: Partial<FeeLine>): boolean {
  if (line.line_type !== 'expense') return false;
  if (line.is_commissionable) return false;
  return line.talent_id != null;
}

/** Narrower helper: crew reimbursement specifically. */
export function isCrewReimbursement(line: Partial<FeeLine>): boolean {
  if (line.line_type !== 'expense') return false;
  if (line.is_commissionable) return false;
  return line.crew_id != null && line.talent_id == null;
}

/**
 * Commissionable artist-labour line types. Listed once here so consumers
 * (QuoteBuilder, JobPnLPanel, computeGstDestinations, the apply path)
 * agree on what counts as "artist labour" vs. "expense / reimbursement".
 *
 * Doctrine: any line whose `line_type` is in this set is, by default,
 * the primary attached artist's labour income — even if the operator
 * forgot to link `talent_id` on the row. `computeGstDestinations` uses
 * this set to fall back to the primary attached talent so the GST
 * passthrough breakdown agrees with `computePaidOut` in JobPnLPanel.
 */
export const ARTIST_LABOUR_LINE_TYPES: ReadonlySet<FeeLineType> = new Set([
  'artist_fee', 'usage_licence', 'file_management', 'post_production', 'artist_overtime', 'artist_travel',
]);

export function computeFeeLine(line: Partial<FeeLine>): ComputedFeeLine {
  const qty = line.quantity ?? 1;
  const price = line.unit_price ?? 0;
  const subtotal = r2(qty * price);
  // Cost subtotal: actual amount paid to payee. Defaults to `subtotal` so
  // legacy callers without cost_subtotal set behave identically to before.
  const costSubtotal = line.cost_subtotal != null ? r2(line.cost_subtotal) : subtotal;
  const spreadCaptured = r2(Math.max(0, subtotal - costSubtotal));

  // ── CLIENT-INVOICE SIDE: uses billed `subtotal` ──────────────────────────
  // ASF: applied to the billed subtotal. Rate is per-line adjustable.
  const asfRate = line.asf_rate ?? DEFAULT_ASF_RATE;
  const asfAmount = r2(subtotal * asfRate);

  // GST: 10% on (subtotal + ASF). Super lines are GST-exempt.
  const gstBase = subtotal + asfAmount;
  const gstAmount = line.is_gst_exempt ? 0 : r2(gstBase * GST_RATE);

  // Super CHARGED to client (15% of billed labour). No GST, no ASF on super.
  const superChargedRate = line.super_rate_charged ?? SUPER_RATE_CHARGED;
  const superChargedAmount = line.is_super_bearing ? r2(subtotal * superChargedRate) : 0;

  // Line total for client invoice: subtotal + ASF + GST (super added separately on the invoice)
  const lineTotal = r2(subtotal + asfAmount + gstAmount);

  // ── PAID-OUT SIDE: uses `costSubtotal` ───────────────────────────────────
  // Super PAID to fund (12% of actual labour cost). Legally, SG is on
  // ordinary time earnings actually paid — not on the quoted amount.
  const superPaidRate = line.super_rate_paid ?? SUPER_RATE_PAID;
  const superPaidAmount = line.is_super_bearing ? r2(costSubtotal * superPaidRate) : 0;

  // Commission: 20% on what the artist actually invoices (cost). When the
  // artist underbills relative to quote, agency captures the spread instead
  // of charging commission on the unbilled portion.
  const commRate = line.commission_rate ?? DEFAULT_COMMISSION_RATE;
  const commissionAmount = line.is_commissionable ? r2(costSubtotal * commRate) : 0;
  const commissionGst = line.is_commissionable ? r2(commissionAmount * GST_RATE) : 0;

  return {
    subtotal, costSubtotal, spreadCaptured,
    asfAmount, gstAmount,
    superChargedAmount, superPaidAmount,
    commissionAmount, commissionGst,
    lineTotal,
  };
}

// ============================================================
// Compute quote totals from a set of fee lines
// ============================================================

export interface QuoteTotals {
  /** Sum of `subtotal` (billed to client). */
  subtotal: number;
  /** Sum of `costSubtotal` (actually paid to payees). Equals subtotal when no line has cost_subtotal set. */
  costSubtotal: number;
  /** Sum of spread captured across all lines (subtotal − costSubtotal). 0 when no cost overrides exist. */
  totalSpreadCaptured: number;
  totalAsf: number;
  totalGst: number;
  totalSuper: number;       // charged to client (15% × billed)
  totalSuperPaid: number;   // paid to fund (12% × cost)
  grandTotal: number;       // subtotal + ASF + GST + super (client pays this)
  totalCommission: number;  // agency retains from artist payments (20% × cost)
  totalCommissionGst: number;
  lines: ComputedFeeLine[];
}

export function computeQuoteTotals(lines: Partial<FeeLine>[]): QuoteTotals {
  const computed = lines.map(computeFeeLine);

  const subtotal = r2(computed.reduce((s, l) => s + l.subtotal, 0));
  const costSubtotal = r2(computed.reduce((s, l) => s + l.costSubtotal, 0));
  const totalSpreadCaptured = r2(computed.reduce((s, l) => s + l.spreadCaptured, 0));
  const totalAsf = r2(computed.reduce((s, l) => s + l.asfAmount, 0));
  const totalGst = r2(computed.reduce((s, l) => s + l.gstAmount, 0));
  const totalSuper = r2(computed.reduce((s, l) => s + l.superChargedAmount, 0));
  const totalSuperPaid = r2(computed.reduce((s, l) => s + l.superPaidAmount, 0));
  const grandTotal = r2(subtotal + totalAsf + totalGst + totalSuper);
  const totalCommission = r2(computed.reduce((s, l) => s + l.commissionAmount, 0));
  const totalCommissionGst = r2(computed.reduce((s, l) => s + l.commissionGst, 0));

  return {
    subtotal, costSubtotal, totalSpreadCaptured,
    totalAsf, totalGst, totalSuper, totalSuperPaid,
    grandTotal, totalCommission, totalCommissionGst, lines: computed,
  };
}

// ============================================================
// Agency margin (gross revenue retained on the booking)
// ============================================================

export interface AgencyMargin {
  commission: number;       // 20% commission on artist labour (× cost)
  asf: number;              // ASF charged to client (default 15% × billed)
  superSpread: number;      // billed × 15% − cost × 12% on crew super
  /**
   * Spread captured when actual cost < billed (e.g. crew underbilled relative
   * to quote). Always ≥ 0 — when cost ≥ billed (the normal case), this is 0.
   */
  spreadCaptured: number;
  total: number;            // commission + asf + superSpread + spreadCaptured
}

/**
 * Compute the agency's gross margin from a fee-line summary.
 * This is what Saunders & Co retains, before operating costs and tax.
 *
 * Components:
 *   - 20% commission on artist labour COST (paid out of artist's actual invoice)
 *   - ASF (default 15%) charged to the client on top of billed subtotals
 *   - Super spread on crew labour: billed × 15% − cost × 12%
 *   - Spread captured: sum of (billed − cost) across all lines where cost was
 *     explicitly recorded below billed (e.g. quoted $600, invoiced $550 → $50)
 *
 * GST flows through — not part of margin.
 */
export function computeAgencyMargin(totals: QuoteTotals): AgencyMargin {
  const commission = totals.totalCommission;
  const asf = totals.totalAsf;
  const superSpread = r2(totals.totalSuper - totals.totalSuperPaid);
  const spreadCaptured = totals.totalSpreadCaptured;
  const total = r2(commission + asf + superSpread + spreadCaptured);
  return { commission, asf, superSpread, spreadCaptured, total };
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
 * Inputs should be COST-side subtotals (what's actually paid to payees), not
 * billed subtotals. When `cost_subtotal` is not set on any line, cost = billed
 * and behaviour is unchanged from before. When cost < billed, input credits
 * are smaller (10% of cost, not 10% of billed) — agency owes ATO more, which
 * lines up with the extra revenue captured in spreadCaptured.
 *
 * `artistFeeSubtotal` and `crewLabourSubtotalGstRegistered` are GROSS labour
 * COST subtotals. `artistGstRegistered` controls whether artist's input credit
 * applies (artists are typically GST-registered). For crew, only the cost
 * portion that came from GST-registered crew members generates credits.
 */
export function computeGstPassthrough(args: {
  totals: QuoteTotals;
  artistFeeSubtotal: number;
  artistGstRegistered: boolean;
  crewLabourSubtotalGstRegistered: number;
  /** Sum of artist-linked non-commissionable lines (reimbursements).
   *  When the artist is GST-registered and on-charges what they paid
   *  (gear, travel, etc.), their invoice to the agency includes 10%
   *  GST — agency claims it back as input credit and passes the cash
   *  to the artist. */
  artistReimbursementSubtotal?: number;
  /** Sum of crew-linked non-commissionable lines (reimbursements) paid
   *  to GST-registered crew. Same flow as artist reimbursements —
   *  agency claims the input credit and reimburses the crew member.
   *  Added 2026-05-19: previously crew reimbursements (e.g. an
   *  assistant fronting the catering bill) were treated as agency
   *  costs with no pass-through, which over-stated agency margin and
   *  under-stated input credits. */
  crewReimbursementSubtotalGstRegistered?: number;
}): GstPassthrough {
  const {
    totals,
    artistFeeSubtotal,
    artistGstRegistered,
    crewLabourSubtotalGstRegistered,
    artistReimbursementSubtotal = 0,
    crewReimbursementSubtotalGstRegistered = 0,
  } = args;

  const collectedOnLines = totals.totalGst;
  const collectedOnCommission = totals.totalCommissionGst;
  const collectedTotal = r2(collectedOnLines + collectedOnCommission);

  // Artist input credits: GST on artist labour subtotal + GST on artist
  // reimbursement subtotal (both passed through to the artist when GST
  // registered).
  const artistInputCredits = artistGstRegistered
    ? r2((artistFeeSubtotal + artistReimbursementSubtotal) * GST_RATE)
    : 0;
  // Crew input credits: GST on crew labour + crew reimbursements paid
  // to GST-registered crew. Caller is responsible for filtering both
  // subtotals to GST-registered crew only.
  const crewInputCredits = r2(
    (crewLabourSubtotalGstRegistered + crewReimbursementSubtotalGstRegistered) * GST_RATE,
  );
  const inputCreditsTotal = r2(artistInputCredits + crewInputCredits);

  const netToAto = r2(collectedTotal - inputCreditsTotal);

  return {
    collectedOnLines, collectedOnCommission, collectedTotal,
    artistInputCredits, crewInputCredits, inputCreditsTotal, netToAto,
  };
}

// ============================================================
// GST destinations — per-line, per-person passthrough breakdown
// ============================================================
// `computeGstPassthrough` (above) returns aggregate input-credit totals
// suitable for the BAS line on the agency P&L. The summary UI wants a
// finer slice: WHICH person each chunk of GST passes through to, so the
// breakdown can read "GST passed to Oliver · photographer · $425" rather
// than a single "Input credits" line.
//
// Doctrine for the split (matches the existing engine, restated per-line):
//   - Line with NO person linked → its GST belongs to the agency,
//     remitted to ATO at BAS time.
//   - Line WITH a person linked AND the person is GST-registered → the
//     GST on what the person actually invoices (line.cost_subtotal ?? line.subtotal,
//     i.e. effectiveCost) passes through to that person. The
//     agency-side spread ((billed − cost) + ASF) stays with the agency
//     and is owed to ATO.
//   - Line WITH a person linked BUT person is NOT GST-registered → the
//     person doesn't charge GST, so the whole line GST stays with the
//     agency and goes to ATO.
//   - Agency commission on artist labour earns its own GST (collected
//     from the client by inflating the artist's line) — owed to ATO.

export interface GstDestinationParty {
  party: 'talent' | 'crew';
  id: string;
  /** Display name (talent.working_name or crew.name). */
  name: string;
  /** Discipline (talent) or primary_role (crew). null when not loaded. */
  roleLabel: string | null;
  /** Total GST passing through to this person on this booking. */
  amount: number;
}

export interface GstDestinations {
  /** What the agency actually owes the ATO on this booking. */
  netToAto: number;
  /** Component: GST on lines where no person is linked. */
  atoFromAgencyLines: number;
  /** Component: GST on lines where the linked person is NOT GST-registered. */
  atoFromNonRegisteredPersonLines: number;
  /** Component: agency-side spread + ASF portion of person-linked lines (when person IS registered). */
  atoFromAgencySpreadOnPersonLines: number;
  /** Component: GST owed on the agency's commission income. */
  atoFromCommission: number;
  /** GST passing through to each GST-registered person (talent or crew). */
  passthroughs: GstDestinationParty[];
  /** Sum of `passthroughs[].amount`. */
  totalPassthrough: number;
  /** Sum of GST collected from the client (line GST + commission GST). */
  collectedTotal: number;
}

type PartyLookup = {
  /** Optional roster of attached talent for name lookup. */
  bookingTalent: Array<{ talent_id: string; talent?: { working_name?: string | null; discipline?: string | null; gst_registered?: boolean | null } | null }>;
  /** Optional roster of attached crew for name lookup. */
  bookingCrew: Array<{ crew_id: string; crew?: { name?: string | null; primary_role?: string | null; gst_registered?: boolean | null } | null }>;
};

/**
 * Compute per-person GST passthroughs and the residual ATO net liability.
 *
 * Inputs:
 *   - `lines`: raw fee-line records (we re-compute per-line to avoid
 *     coupling to ComputedFeeLine ordering).
 *   - `totals`: pre-computed totals (we use `totalCommissionGst`).
 *   - `parties`: talent + crew roster so we can attach a name/role to
 *     each passthrough.
 *
 * Reconciles to: `netToAto + totalPassthrough === collectedTotal`. The
 * test in fee-engine.test.ts asserts this for the canonical AJE example.
 */
export function computeGstDestinations(args: {
  lines: Partial<FeeLine>[];
  totals: QuoteTotals;
  parties: PartyLookup;
}): GstDestinations {
  const { lines, totals, parties } = args;
  const { bookingTalent, bookingCrew } = parties;

  // Per-person accumulators. Use Map keyed by `talent:<id>` or `crew:<id>`
  // so we can lift them out into the passthroughs array preserving party kind.
  const perPerson = new Map<string, { party: 'talent' | 'crew'; id: string; amount: number }>();

  let atoFromAgencyLines = 0;
  let atoFromNonRegisteredPersonLines = 0;
  let atoFromAgencySpreadOnPersonLines = 0;

  // Primary attached talent — used as the fallback owner for any
  // commissionable artist-labour line that wasn't explicitly linked to
  // a talent on the row (operator forgot, or it was auto-generated from
  // a template before the per-line talent_id model existed). Mirrors
  // computePaidOut in JobPnLPanel — without this fallback the two
  // panels disagree by the artist's labour-GST amount.
  const primaryTalentRow = bookingTalent[0] ?? null;
  const primaryTalentId = primaryTalentRow?.talent_id ?? null;

  for (const line of lines) {
    if (line.is_gst_exempt) continue;
    const computed = computeFeeLine(line);
    if (computed.gstAmount === 0) continue;

    let talentId = line.talent_id ?? null;
    const crewId = line.crew_id ?? null;
    const isCommissionableArtistLine = !crewId
      && !!line.line_type
      && ARTIST_LABOUR_LINE_TYPES.has(line.line_type as FeeLineType)
      && line.is_commissionable !== false;

    // Fallback: commissionable artist-labour line with no explicit
    // talent_id → attribute to the primary attached artist. Crew lines
    // never fall back (no parallel "primary crew" concept).
    if (!talentId && !crewId && isCommissionableArtistLine && primaryTalentId) {
      talentId = primaryTalentId;
    }

    // Mutually-exclusive person link: prefer talent if both somehow set.
    if (!talentId && !crewId) {
      // No person linked AND not a fallback-eligible artist line —
      // full line GST is agency's, owed to ATO.
      atoFromAgencyLines = r2(atoFromAgencyLines + computed.gstAmount);
      continue;
    }

    const isTalent = !!talentId;
    const partyKey = isTalent ? `talent:${talentId}` : `crew:${crewId}`;
    const partyId = (isTalent ? talentId : crewId) as string;

    const personGstRegistered = isTalent
      ? (bookingTalent.find((bt) => bt.talent_id === partyId)?.talent?.gst_registered ?? false)
      : (bookingCrew.find((bc) => bc.crew_id === partyId)?.crew?.gst_registered ?? false);

    if (!personGstRegistered) {
      // Person doesn't charge GST → agency keeps the line GST → ATO.
      atoFromNonRegisteredPersonLines = r2(atoFromNonRegisteredPersonLines + computed.gstAmount);
      continue;
    }

    // Person IS GST-registered. They invoice the agency for the COST
    // portion + 10% on that cost. The agency-side spread + ASF stays with
    // the agency and is owed to ATO.
    const passToPerson = r2(computed.costSubtotal * GST_RATE);
    const stayWithAgency = r2(Math.max(0, computed.gstAmount - passToPerson));

    atoFromAgencySpreadOnPersonLines = r2(atoFromAgencySpreadOnPersonLines + stayWithAgency);
    const existing = perPerson.get(partyKey);
    if (existing) {
      existing.amount = r2(existing.amount + passToPerson);
    } else {
      perPerson.set(partyKey, { party: isTalent ? 'talent' : 'crew', id: partyId, amount: passToPerson });
    }
  }

  const atoFromCommission = totals.totalCommissionGst;

  // Resolve display names off the rosters.
  const passthroughs: GstDestinationParty[] = Array.from(perPerson.values()).map((p) => {
    if (p.party === 'talent') {
      const row = bookingTalent.find((bt) => bt.talent_id === p.id);
      return {
        party: 'talent',
        id: p.id,
        name: row?.talent?.working_name ?? 'Talent',
        roleLabel: row?.talent?.discipline ?? null,
        amount: p.amount,
      };
    }
    const row = bookingCrew.find((bc) => bc.crew_id === p.id);
    return {
      party: 'crew',
      id: p.id,
      name: row?.crew?.name ?? 'Crew',
      roleLabel: row?.crew?.primary_role ?? null,
      amount: p.amount,
    };
  });

  const totalPassthrough = r2(passthroughs.reduce((s, p) => s + p.amount, 0));
  const netToAto = r2(
    atoFromAgencyLines
    + atoFromNonRegisteredPersonLines
    + atoFromAgencySpreadOnPersonLines
    + atoFromCommission,
  );
  const collectedTotal = r2(totals.totalGst + totals.totalCommissionGst);

  return {
    netToAto,
    atoFromAgencyLines,
    atoFromNonRegisteredPersonLines,
    atoFromAgencySpreadOnPersonLines,
    atoFromCommission,
    passthroughs,
    totalPassthrough,
    collectedTotal,
  };
}

// ============================================================
// Artist net payment calculator
// ============================================================

export interface ArtistPayment {
  grossFees: number;             // sum of artist fee lines (labour)
  commission: number;            // 20% of grossFees
  commissionGst: number;         // GST on commission
  artistGst: number;             // GST the artist charges on fees + reimbursements
  /** Sum of artist-linked non-commissionable lines (gear/travel paid for and on-charged). */
  reimbursementSubtotal: number;
  netPayment: number;            // grossFees - commission - commissionGst + reimbursementSubtotal + artistGst
}

/**
 * Compute the artist's net cheque from the agency.
 *
 * Two cost buckets feed into the artist's take-home:
 *   1. `artistFeeSubtotal` — commissionable labour (artist_fee, file_management,
 *      post_production, usage_licence, artist_overtime, artist_travel).
 *      Commission is deducted; the artist's GST applies on top if registered.
 *   2. `reimbursementSubtotal` — non-commissionable lines linked to this
 *      artist (typically `expense` lines where the artist fronted gear or
 *      travel costs). NO commission. NO ASF (ASF stays with agency on the
 *      client side). The artist's GST applies on top if registered, which
 *      agency claims back as an input credit per PR#196.
 *
 * Both subtotals should be COST subtotals — what the artist actually invoices.
 * When cost_subtotal isn't set, cost = billed (legacy behaviour preserved).
 */
export function computeArtistPayment(
  artistFeeSubtotal: number,
  isGstRegistered: boolean,
  reimbursementSubtotal: number = 0,
): ArtistPayment {
  const commission = r2(artistFeeSubtotal * DEFAULT_COMMISSION_RATE);
  const commissionGst = r2(commission * GST_RATE);
  const artistGst = isGstRegistered
    ? r2((artistFeeSubtotal + reimbursementSubtotal) * GST_RATE)
    : 0;
  const netPayment = r2(
    artistFeeSubtotal - commission - commissionGst + reimbursementSubtotal + artistGst,
  );

  return {
    grossFees: artistFeeSubtotal,
    commission,
    commissionGst,
    artistGst,
    reimbursementSubtotal,
    netPayment,
  };
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
  labourSubtotal: number;    // crew_labour — super-bearing wages
  overtimeSubtotal: number;  // crew overtime — GST-bearing but NOT super-bearing (doctrine)
  expensesSubtotal: number;  // crew_equipment / reimbursables they paid for and are billing back
  superPaid: number;         // 12% of labourSubtotal only — overtime is NOT super-bearing
  gst: number;               // 10% on (labour + overtime + expenses) if GST registered
  netPayment: number;        // labour + overtime + expenses + super + GST
}

/**
 * Compute what the crew member is paid by the agency.
 *
 * Doctrine note: overtime is GST-bearing but NOT super-bearing (CLAUDE.md fee
 * table). Pre-2026-05-16 this function accepted a combined `labourSubtotal`
 * with crew_labour + overtime merged, which over-paid super by ~12% of any
 * overtime billed. The `overtimeSubtotal` parameter splits them out — pass
 * crew_labour as labourSubtotal and overtime as overtimeSubtotal.
 *
 * The parameter is optional (defaults to 0) so existing callers that don't
 * book overtime stay byte-identical. The AJE eComm #3579 canonical test has
 * no overtime so it passes unchanged.
 */
export function computeCrewPayment(
  labourSubtotal: number,
  expensesSubtotal: number,
  isGstRegistered: boolean,
  overtimeSubtotal: number = 0,
): CrewPayment {
  // Super on labour only — overtime is intentionally excluded per AU doctrine.
  const superPaid = r2(labourSubtotal * SUPER_RATE_PAID);
  // GST on labour + overtime + expenses, NEVER on super (super is GST-free in AU)
  const gst = isGstRegistered
    ? r2((labourSubtotal + overtimeSubtotal + expensesSubtotal) * GST_RATE)
    : 0;
  const netPayment = r2(labourSubtotal + overtimeSubtotal + expensesSubtotal + superPaid + gst);
  return { labourSubtotal, overtimeSubtotal, expensesSubtotal, superPaid, gst, netPayment };
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
  // Test-helper convenience default — leaves ASF off so the canonical
  // AJE eComm #3579 test can pass `createExpenseLine('expense', 'Catering', 180, 1)`
  // and get a 0% ASF line without specifying it explicitly. Production
  // code paths (`addExpenseLineAction`, QuoteBuilder UI) honour the
  // doctrine ASF 15% default via `lineTypeDefaults('expense')`.
  asfRate = 0,
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
