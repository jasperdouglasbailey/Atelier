'use client';

import type { FeeLine, QuoteVersion, BookingTalent, BookingCrew } from '@/lib/types/database';
import { computeQuoteTotals, computeAgencyMargin, computeArtistPayment, computeCrewPayment, effectiveCost, isReimbursement } from '@/lib/utils/fee-engine';
import { formatCurrency } from '@/lib/utils/format';
import { PALETTE, GST_RATE } from '@/lib/utils/constants';

type Props = {
  feeLines: FeeLine[];
  latestQuote: QuoteVersion | null;
  bookingTalent?: BookingTalent[];
  bookingCrew?: BookingCrew[];
};

const POST_SHOOT_TYPES = new Set<FeeLine['line_type']>(['crew_overtime', 'artist_overtime', 'expense']);
const ARTIST_LINE_TYPES = new Set<FeeLine['line_type']>([
  'artist_fee', 'usage_licence', 'file_management', 'post_production', 'artist_overtime', 'artist_travel',
]);
// Crew labour split into super-bearing (crew_labour) and non-super-bearing
// (overtime) buckets — doctrine says overtime is GST-bearing but not
// super-bearing. Previously these were lumped together and 12% super was
// applied to the combined total, overstating Paid-Out by 12% of every OT
// line. Quote totals were unaffected (line-level is_super_bearing was
// always correct) — this was a display bug on the P&L panel only.
const CREW_SUPER_BEARING_TYPES = new Set<FeeLine['line_type']>(['crew_labour']);
const CREW_OVERTIME_TYPES = new Set<FeeLine['line_type']>(['crew_overtime']);

/**
 * Compute total paid out to artists + crew for this booking.
 *
 * Distinct from "Actual" (what we bill the client) — this is what we *send*
 * to the people we hired. Retained ≈ Actual − Paid out (before vendor
 * invoices and net GST to ATO).
 *
 * Pass-through vendor invoices (equipment, studio, travel, catering, props)
 * are NOT counted here — they're billed to the agency separately and don't
 * pass through our payroll.
 */
function computePaidOut(
  lines: FeeLine[],
  bookingTalent: BookingTalent[],
  bookingCrew: BookingCrew[],
): { artistNet: number; crewTotal: number; reimbursementTotal: number; total: number } {
  // Paid-out math uses COST subtotal (effectiveCost = cost_subtotal ?? subtotal).
  // When no line overrides cost, this collapses to the historical billed-based
  // behaviour. When cost < billed, paid-out is smaller and the spread shows
  // up as captured agency margin instead.
  const primaryArtist = bookingTalent[0]?.talent;
  const artistGstRegistered = primaryArtist?.gst_registered ?? false;
  const artistCostSubtotal = lines
    .filter((l) => ARTIST_LINE_TYPES.has(l.line_type) && !isReimbursement(l))
    .reduce((s, l) => s + effectiveCost(l), 0);
  const artistNet = artistCostSubtotal > 0
    ? Math.round(computeArtistPayment(artistCostSubtotal, artistGstRegistered).netPayment * 100) / 100
    : 0;

  // Reimbursements are pass-through. The artist on-charges what they actually
  // paid the supplier — that's the cost subtotal. Use effectiveCost so a
  // discount on the supplier invoice flows correctly.
  const reimbursementCostSubtotal = lines
    .filter((l) => isReimbursement(l))
    .reduce((s, l) => s + effectiveCost(l), 0);
  const reimbursementTotal = reimbursementCostSubtotal > 0 && artistGstRegistered
    ? Math.round(reimbursementCostSubtotal * (1 + GST_RATE) * 100) / 100
    : reimbursementCostSubtotal;

  const crewByPersonLabour = new Map<string, number>();
  const crewByPersonOvertime = new Map<string, number>();
  const crewByPersonExpenses = new Map<string, number>();
  // Track which crew IDs have any contribution so we don't miss someone
  // whose only fee line is overtime (eg post-shoot OT entry).
  const crewIds = new Set<string>();
  for (const l of lines) {
    if (!l.crew_id) continue;
    if (CREW_SUPER_BEARING_TYPES.has(l.line_type)) {
      crewByPersonLabour.set(l.crew_id, (crewByPersonLabour.get(l.crew_id) ?? 0) + effectiveCost(l));
      crewIds.add(l.crew_id);
    } else if (CREW_OVERTIME_TYPES.has(l.line_type)) {
      crewByPersonOvertime.set(l.crew_id, (crewByPersonOvertime.get(l.crew_id) ?? 0) + effectiveCost(l));
      crewIds.add(l.crew_id);
    } else if (l.line_type === 'expense') {
      // Crew-linked expense (was previously crew_equipment/equipment_rental/etc.
      // before PR3 consolidated them into one `expense` type).
      crewByPersonExpenses.set(l.crew_id, (crewByPersonExpenses.get(l.crew_id) ?? 0) + effectiveCost(l));
      crewIds.add(l.crew_id);
    }
  }
  let crewOut = 0;
  for (const crewId of crewIds) {
    const crewRow = bookingCrew.find((bc) => bc.crew_id === crewId);
    const isRegistered = crewRow?.crew?.gst_registered ?? false;
    const labour = crewByPersonLabour.get(crewId) ?? 0;
    const overtime = crewByPersonOvertime.get(crewId) ?? 0;
    const expenses = crewByPersonExpenses.get(crewId) ?? 0;
    crewOut += computeCrewPayment(labour, expenses, isRegistered, overtime).netPayment;
  }
  // Unlinked labour / overtime — crew not yet assigned to a booking_crew
  // row. Treated as non-GST (the safer assumption when payee unknown).
  const unlinkedLabour = lines
    .filter((l) => CREW_SUPER_BEARING_TYPES.has(l.line_type) && !l.crew_id)
    .reduce((s, l) => s + effectiveCost(l), 0);
  const unlinkedOvertime = lines
    .filter((l) => CREW_OVERTIME_TYPES.has(l.line_type) && !l.crew_id)
    .reduce((s, l) => s + effectiveCost(l), 0);
  if (unlinkedLabour > 0 || unlinkedOvertime > 0) {
    crewOut += computeCrewPayment(unlinkedLabour, 0, false, unlinkedOvertime).netPayment;
  }

  const total = Math.round((artistNet + reimbursementTotal + crewOut) * 100) / 100;
  return { artistNet, crewTotal: crewOut, reimbursementTotal, total };
}

export default function JobPnLPanel({ feeLines, latestQuote, bookingTalent = [], bookingCrew = [] }: Props) {
  if (!latestQuote || feeLines.length === 0) {
    return (
      <section className="rounded-lg border p-4" style={{ background: PALETTE.surface, borderColor: PALETTE.border }}>
        <h3 className="section-title mb-2">Job P&amp;L</h3>
        <p className="text-xs" style={{ color: PALETTE.muted }}>Appears once a quote with fee lines exists for this booking.</p>
      </section>
    );
  }

  const quotedLines = feeLines.filter((l) => !POST_SHOOT_TYPES.has(l.line_type));
  const postShootLines = feeLines.filter((l) => POST_SHOOT_TYPES.has(l.line_type));

  const quotedTotals = computeQuoteTotals(quotedLines);
  const actualTotals = computeQuoteTotals(feeLines);

  const quotedMargin = computeAgencyMargin(quotedTotals);
  const actualMargin = computeAgencyMargin(actualTotals);

  const paidOut = computePaidOut(feeLines, bookingTalent, bookingCrew);

  const retained = actualTotals.grandTotal > 0
    ? Math.round((actualTotals.grandTotal - paidOut.total) * 100) / 100
    : 0;
  const retainedPct = actualTotals.grandTotal > 0
    ? (retained / actualTotals.grandTotal) * 100 : null;

  const actualMarginPct = actualTotals.grandTotal > 0
    ? (actualMargin.total / actualTotals.grandTotal) * 100 : null;

  const revenueDrift = actualTotals.grandTotal - quotedTotals.grandTotal;
  const hasPostShoot = postShootLines.length > 0;

  return (
    <section
      className="rounded-lg border p-4"
      style={{ background: PALETTE.surface, borderColor: PALETTE.border }}
    >
      <h3 className="section-title mb-3">Job P&amp;L</h3>

      <div className="space-y-2">
        <KpiRow
          label="Quoted"
          value={quotedTotals.grandTotal}
          sub={`Margin ${formatCurrency(quotedMargin.total)}`}
        />
        <KpiRow
          label="Actual"
          value={actualTotals.grandTotal}
          sub={hasPostShoot
            ? `Margin ${formatCurrency(actualMargin.total)}${actualMarginPct !== null ? ` · ${actualMarginPct.toFixed(1)}%` : ''}`
            : 'No OT/extras yet'}
          accent
        />
        {paidOut.total > 0 && (
          <KpiRow
            label="Paid out"
            value={paidOut.total}
            sub={[
              `Artist ${formatCurrency(paidOut.artistNet)}`,
              `crew ${formatCurrency(paidOut.crewTotal)}`,
              paidOut.reimbursementTotal > 0 && `reimb ${formatCurrency(paidOut.reimbursementTotal)}`,
            ].filter(Boolean).join(' · ')}
            muted
          />
        )}
        <KpiRow
          label="Retained"
          value={retained}
          sub={retainedPct !== null
            ? `${retainedPct.toFixed(1)}% of actual · before ATO + vendors`
            : 'Before ATO + vendors'}
          okIfPositive
        />
        {/* True margin: agency's actual gross margin including spread captured
            when payee invoiced less than billed. Equal to retained minus the
            net GST owed to ATO. Surfaces what the agency really earned. */}
        {actualMargin.spreadCaptured > 0 && (
          <KpiRow
            label="True margin"
            value={actualMargin.total}
            sub={`Commission ${formatCurrency(actualMargin.commission)} · ASF ${formatCurrency(actualMargin.asf)} · super spread ${formatCurrency(actualMargin.superSpread)} · captured ${formatCurrency(actualMargin.spreadCaptured)}`}
            okIfPositive
          />
        )}
      </div>

      {hasPostShoot && revenueDrift !== 0 && (
        <div
          className="mt-3 flex items-center justify-between rounded-md px-3 py-2 text-[11px]"
          style={{ background: PALETTE.bg }}
        >
          <span className="micro-label" style={{ marginBottom: 0 }}>Revenue drift</span>
          <span
            className="text-xs font-semibold tabular-nums"
            style={{ color: revenueDrift >= 0 ? PALETTE.ok : PALETTE.danger }}
          >
            {revenueDrift >= 0 ? '+' : ''}{formatCurrency(revenueDrift)}
          </span>
        </div>
      )}

      {actualMargin.spreadCaptured > 0 && (
        <div
          className="mt-2 flex items-center justify-between rounded-md px-3 py-2 text-[11px]"
          style={{ background: `${PALETTE.ok}10`, borderLeft: `2px solid ${PALETTE.ok}` }}
        >
          <span className="micro-label" style={{ marginBottom: 0, color: PALETTE.ok }}>
            Spread captured (cost &lt; billed)
          </span>
          <span
            className="text-xs font-semibold tabular-nums"
            style={{ color: PALETTE.ok }}
          >
            +{formatCurrency(actualMargin.spreadCaptured)}
          </span>
        </div>
      )}
    </section>
  );
}

function KpiRow({
  label, value, sub, accent, muted, okIfPositive,
}: {
  label: string;
  value: number;
  sub?: string;
  accent?: boolean;
  muted?: boolean;
  okIfPositive?: boolean;
}) {
  const valueColor = okIfPositive
    ? (value > 0 ? PALETTE.ok : PALETTE.danger)
    : muted
      ? PALETTE.muted
      : PALETTE.text;
  return (
    <div
      className="rounded-md border px-3 py-2"
      style={{
        background: accent ? `${PALETTE.accent}0d` : PALETTE.bg,
        borderColor: accent ? `${PALETTE.accent}40` : 'transparent',
      }}
    >
      <div className="flex items-baseline justify-between gap-3">
        <div className="micro-label" style={{ marginBottom: 0 }}>{label}</div>
        <div
          className="text-base font-semibold tabular-nums"
          style={{ color: valueColor }}
        >
          {formatCurrency(value)}
        </div>
      </div>
      {sub && (
        <div className="mt-0.5 text-[10px]" style={{ color: PALETTE.muted }}>
          {sub}
        </div>
      )}
    </div>
  );
}
