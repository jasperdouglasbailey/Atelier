'use client';

import type { FeeLine, QuoteVersion, BookingTalent, BookingCrew } from '@/lib/types/database';
import { computeQuoteTotals, computeAgencyMargin, computeArtistPayment, computeCrewPayment, effectiveCost } from '@/lib/utils/fee-engine';
import { buildArtistBillBreakdown, buildCrewBillBreakdown } from '@/lib/utils/person-billing';
import { formatCurrency } from '@/lib/utils/format';
import { PALETTE, GST_RATE } from '@/lib/utils/constants';

type Props = {
  feeLines: FeeLine[];
  latestQuote: QuoteVersion | null;
  bookingTalent?: BookingTalent[];
  bookingCrew?: BookingCrew[];
  /** Booking's shoot_dates daterange — used to expand virtual day-rate rows
   *  when a roster row has no `assigned_dates` (legacy data). */
  shootDates?: string | null;
};

const POST_SHOOT_TYPES = new Set<FeeLine['line_type']>(['overtime', 'artist_overtime', 'other_expense']);
// Unlinked labour fallback still uses these to handle fee_lines tagged with
// no crew_id. Roster-sourced day rates flow through buildCrewBillBreakdown.
const CREW_SUPER_BEARING_TYPES = new Set<FeeLine['line_type']>(['crew_labour']);
const CREW_OVERTIME_TYPES = new Set<FeeLine['line_type']>(['overtime']);

/**
 * Compute total paid out to artists + crew for this booking.
 *
 * Distinct from "Actual" (what we bill the client) — this is what we *send*
 * to the people we hired. Retained ≈ Actual − Paid out (before vendor
 * invoices and net GST to ATO).
 *
 * Sources income from BOTH the booking roster (day_rate × assigned_dates
 * on atelier_booking_crew / atelier_booking_talent) AND fee_lines tagged
 * with the recipient's id. Before this fix the panel under-counted Paid-Out
 * by every crew/talent day rate that lived only on the roster.
 *
 * Pass-through vendor invoices (equipment, studio, travel, catering, props
 * with no crew_id) are NOT counted here — they're billed to the agency
 * separately and don't pass through our payroll.
 */
function computePaidOut(
  lines: FeeLine[],
  bookingTalent: BookingTalent[],
  bookingCrew: BookingCrew[],
  shootDates: string | null,
): { artistNet: number; crewTotal: number; reimbursementTotal: number; total: number } {
  // ── Artist side: iterate each talent on the booking ────────────────
  let artistNet = 0;
  for (const bt of bookingTalent) {
    const breakdown = buildArtistBillBreakdown({
      bookingTalent: bt,
      shootDates,
      feeLines: lines,
    });
    if (breakdown.feeSubtotal <= 0) continue;
    const gstReg = bt.talent?.gst_registered ?? false;
    artistNet += computeArtistPayment(breakdown.feeSubtotal, gstReg).netPayment;
  }
  // Artist fee_lines that aren't linked to any booking_talent row
  // (no talent_id, or talent_id that's not in the roster). Rare.
  const linkedTalentIds = new Set(bookingTalent.map((bt) => bt.talent_id));
  const unlinkedArtistSubtotal = lines
    .filter((l) =>
      ['artist_fee', 'usage_licence', 'file_management', 'retouching', 'post_production', 'artist_overtime', 'artist_travel']
        .includes(l.line_type) &&
      !l.is_artist_reimbursement &&
      (!l.talent_id || !linkedTalentIds.has(l.talent_id)),
    )
    .reduce((s, l) => s + effectiveCost(l), 0);
  if (unlinkedArtistSubtotal > 0) {
    const fallbackGst = bookingTalent[0]?.talent?.gst_registered ?? false;
    artistNet += computeArtistPayment(unlinkedArtistSubtotal, fallbackGst).netPayment;
  }
  artistNet = Math.round(artistNet * 100) / 100;

  // ── Reimbursements: pass-through at cost (+GST if primary GST-reg) ──
  const primaryArtistGst = bookingTalent[0]?.talent?.gst_registered ?? false;
  const reimbursementCostSubtotal = lines
    .filter((l) => l.is_artist_reimbursement)
    .reduce((s, l) => s + effectiveCost(l), 0);
  const reimbursementTotal = reimbursementCostSubtotal > 0 && primaryArtistGst
    ? Math.round(reimbursementCostSubtotal * (1 + GST_RATE) * 100) / 100
    : reimbursementCostSubtotal;

  // ── Crew side: iterate each crew member on the booking ─────────────
  let crewOut = 0;
  for (const bc of bookingCrew) {
    const breakdown = buildCrewBillBreakdown({
      bookingCrew: bc,
      shootDates,
      feeLines: lines,
    });
    const gstReg = bc.crew?.gst_registered ?? false;
    crewOut += computeCrewPayment(
      breakdown.labourSubtotal,
      breakdown.expensesSubtotal,
      gstReg,
      breakdown.overtimeSubtotal,
    ).netPayment;
  }
  // Unlinked fee_lines — no crew_id, or crew_id that isn't on the roster.
  // Treated as non-GST (safer assumption when payee unknown).
  const linkedCrewIds = new Set(bookingCrew.map((bc) => bc.crew_id));
  const unlinkedLabour = lines
    .filter((l) =>
      CREW_SUPER_BEARING_TYPES.has(l.line_type) &&
      (!l.crew_id || !linkedCrewIds.has(l.crew_id)),
    )
    .reduce((s, l) => s + effectiveCost(l), 0);
  const unlinkedOvertime = lines
    .filter((l) =>
      CREW_OVERTIME_TYPES.has(l.line_type) &&
      (!l.crew_id || !linkedCrewIds.has(l.crew_id)),
    )
    .reduce((s, l) => s + effectiveCost(l), 0);
  if (unlinkedLabour > 0 || unlinkedOvertime > 0) {
    crewOut += computeCrewPayment(unlinkedLabour, 0, false, unlinkedOvertime).netPayment;
  }
  crewOut = Math.round(crewOut * 100) / 100;

  const total = Math.round((artistNet + reimbursementTotal + crewOut) * 100) / 100;
  return { artistNet, crewTotal: crewOut, reimbursementTotal, total };
}

export default function JobPnLPanel({ feeLines, latestQuote, bookingTalent = [], bookingCrew = [], shootDates = null }: Props) {
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

  const paidOut = computePaidOut(feeLines, bookingTalent, bookingCrew, shootDates);

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
