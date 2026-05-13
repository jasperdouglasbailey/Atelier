'use client';

import type { FeeLine, QuoteVersion, BookingTalent, BookingCrew } from '@/lib/types/database';
import { computeQuoteTotals, computeAgencyMargin, computeArtistPayment, computeCrewPayment } from '@/lib/utils/fee-engine';
import { formatCurrency } from '@/lib/utils/format';
import { PALETTE } from '@/lib/utils/constants';

type Props = {
  feeLines: FeeLine[];
  latestQuote: QuoteVersion | null;
  bookingTalent?: BookingTalent[];
  bookingCrew?: BookingCrew[];
};

const POST_SHOOT_TYPES = new Set<FeeLine['line_type']>(['overtime', 'other_expense']);
const ARTIST_LINE_TYPES = new Set<FeeLine['line_type']>([
  'artist_fee', 'usage_licence', 'file_management', 'retouching', 'post_production',
]);
const CREW_LABOUR_LINE_TYPES = new Set<FeeLine['line_type']>(['crew_labour', 'overtime']);

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
): { artistTotal: number; crewTotal: number; total: number } {
  const primaryArtist = bookingTalent[0]?.talent;
  const artistGstRegistered = primaryArtist?.gst_registered ?? false;
  const artistSubtotal = lines
    .filter((l) => ARTIST_LINE_TYPES.has(l.line_type))
    .reduce((s, l) => s + (l.subtotal ?? 0), 0);
  const artistOut = artistSubtotal > 0
    ? computeArtistPayment(artistSubtotal, artistGstRegistered).netPayment
    : 0;

  const crewByPersonLabour = new Map<string, number>();
  const crewByPersonExpenses = new Map<string, number>();
  for (const l of lines) {
    if (!l.crew_id) continue;
    if (CREW_LABOUR_LINE_TYPES.has(l.line_type)) {
      crewByPersonLabour.set(l.crew_id, (crewByPersonLabour.get(l.crew_id) ?? 0) + (l.subtotal ?? 0));
    } else if (l.line_type === 'crew_equipment') {
      crewByPersonExpenses.set(l.crew_id, (crewByPersonExpenses.get(l.crew_id) ?? 0) + (l.subtotal ?? 0));
    }
  }
  let crewOut = 0;
  for (const [crewId, labour] of crewByPersonLabour) {
    const crewRow = bookingCrew.find((bc) => bc.crew_id === crewId);
    const isRegistered = crewRow?.crew?.gst_registered ?? false;
    const expenses = crewByPersonExpenses.get(crewId) ?? 0;
    crewOut += computeCrewPayment(labour, expenses, isRegistered).netPayment;
  }
  const unlinkedCrewLabour = lines
    .filter((l) => CREW_LABOUR_LINE_TYPES.has(l.line_type) && !l.crew_id)
    .reduce((s, l) => s + (l.subtotal ?? 0), 0);
  if (unlinkedCrewLabour > 0) {
    crewOut += computeCrewPayment(unlinkedCrewLabour, 0, false).netPayment;
  }

  const total = Math.round((artistOut + crewOut) * 100) / 100;
  return { artistTotal: artistOut, crewTotal: crewOut, total };
}

export default function JobPnLPanel({ feeLines, latestQuote, bookingTalent = [], bookingCrew = [] }: Props) {
  if (!latestQuote || feeLines.length === 0) return null;

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
        <KpiRow
          label="Paid out"
          value={paidOut.total}
          sub={`Artist ${formatCurrency(paidOut.artistTotal)} · crew ${formatCurrency(paidOut.crewTotal)}`}
          muted
        />
        <KpiRow
          label="Retained"
          value={retained}
          sub={retainedPct !== null
            ? `${retainedPct.toFixed(1)}% of actual · before ATO + vendors`
            : 'Before ATO + vendors'}
          okIfPositive
        />
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
