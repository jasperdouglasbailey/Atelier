'use client';

import type { FeeLine, QuoteVersion } from '@/lib/types/database';
import { computeQuoteTotals, computeAgencyMargin } from '@/lib/utils/fee-engine';
import { formatCurrency } from '@/lib/utils/format';
import { PALETTE } from '@/lib/utils/constants';

type Props = {
  feeLines: FeeLine[];
  latestQuote: QuoteVersion | null;
};

const POST_SHOOT_TYPES = new Set<FeeLine['line_type']>(['overtime', 'other_expense']);

export default function JobPnLPanel({ feeLines, latestQuote }: Props) {
  if (!latestQuote || feeLines.length === 0) return null;

  // Quoted lines = everything on the quote at send time (use all lines for the quote totals)
  const quotedLines = feeLines.filter((l) => !POST_SHOOT_TYPES.has(l.line_type));
  const postShootLines = feeLines.filter((l) => POST_SHOOT_TYPES.has(l.line_type));

  const quotedTotals = computeQuoteTotals(quotedLines);
  const actualTotals = computeQuoteTotals(feeLines);

  const quotedMargin = computeAgencyMargin(quotedTotals);
  const actualMargin = computeAgencyMargin(actualTotals);

  const quotedMarginPct = quotedTotals.grandTotal > 0
    ? (quotedMargin.total / quotedTotals.grandTotal) * 100 : null;
  const actualMarginPct = actualTotals.grandTotal > 0
    ? (actualMargin.total / actualTotals.grandTotal) * 100 : null;

  const marginDrift = quotedMarginPct !== null && actualMarginPct !== null
    ? actualMarginPct - quotedMarginPct : null;
  const revenueDrift = actualTotals.grandTotal - quotedTotals.grandTotal;
  const hasPostShoot = postShootLines.length > 0;

  return (
    <section
      className="rounded-lg border p-4"
      style={{ background: PALETTE.surface, borderColor: PALETTE.border }}
    >
      <h3 className="section-title mb-3">
        Job P&amp;L
      </h3>

      <div className="grid grid-cols-2 gap-3">
        {/* Quoted */}
        <div className="rounded-md p-3" style={{ background: PALETTE.bg }}>
          <div className="text-[10px] uppercase tracking-wide mb-1" style={{ color: PALETTE.muted }}>Quoted</div>
          <div className="text-lg font-semibold tabular-nums" style={{ color: PALETTE.text }}>
            {formatCurrency(quotedTotals.grandTotal)}
          </div>
          <div className="text-[11px] mt-0.5" style={{ color: PALETTE.muted }}>
            Agency margin: {formatCurrency(quotedMargin.total)}{' '}
            <span className="tabular-nums">({quotedMarginPct !== null ? `${quotedMarginPct.toFixed(1)}%` : '—'})</span>
          </div>
        </div>

        {/* Actual */}
        <div className="rounded-md p-3" style={{ background: PALETTE.bg }}>
          <div className="text-[10px] uppercase tracking-wide mb-1" style={{ color: PALETTE.muted }}>
            Actual {!hasPostShoot && <span style={{ color: PALETTE.muted }}>(no OT/extras)</span>}
          </div>
          <div className="text-lg font-semibold tabular-nums" style={{ color: PALETTE.text }}>
            {formatCurrency(actualTotals.grandTotal)}
          </div>
          <div className="text-[11px] mt-0.5" style={{ color: PALETTE.muted }}>
            Agency margin: {formatCurrency(actualMargin.total)}{' '}
            <span className="tabular-nums">({actualMarginPct !== null ? `${actualMarginPct.toFixed(1)}%` : '—'})</span>
          </div>
        </div>
      </div>

      {/* Drift row — only meaningful once OT/expenses have been added */}
      {hasPostShoot && (
        <div className="mt-3 flex items-center gap-4 rounded-md px-3 py-2" style={{ background: PALETTE.bg }}>
          <div>
            <span className="text-[10px] uppercase tracking-wide" style={{ color: PALETTE.muted }}>Revenue drift </span>
            <span
              className="text-xs font-semibold tabular-nums ml-1"
              style={{ color: revenueDrift >= 0 ? PALETTE.success : PALETTE.danger }}
            >
              {revenueDrift >= 0 ? '+' : ''}{formatCurrency(revenueDrift)}
            </span>
          </div>
          <div>
            <span className="text-[10px] uppercase tracking-wide" style={{ color: PALETTE.muted }}>Margin drift </span>
            <span
              className="text-xs font-semibold tabular-nums ml-1"
              style={{ color: marginDrift !== null && marginDrift >= 0 ? PALETTE.success : PALETTE.danger }}
            >
              {marginDrift !== null ? `${marginDrift >= 0 ? '+' : ''}${marginDrift.toFixed(1)}pp` : '—'}
            </span>
          </div>
          {postShootLines.length > 0 && (
            <div className="ml-auto text-[10px]" style={{ color: PALETTE.muted }}>
              {postShootLines.length} post-shoot line{postShootLines.length === 1 ? '' : 's'}
            </div>
          )}
        </div>
      )}

      {/* Margin breakdown */}
      <div className="mt-3 space-y-1">
        {[
          { label: 'Commission', quoted: quotedMargin.commission, actual: actualMargin.commission },
          { label: 'ASF', quoted: quotedMargin.asf, actual: actualMargin.asf },
          { label: 'Super spread', quoted: quotedMargin.superSpread, actual: actualMargin.superSpread },
        ].map(({ label, quoted, actual }) => (
          <div key={label} className="flex items-center justify-between text-[11px]" style={{ color: PALETTE.muted }}>
            <span>{label}</span>
            <span className="tabular-nums">
              {formatCurrency(quoted)}
              {hasPostShoot && actual !== quoted && (
                <span style={{ color: actual > quoted ? PALETTE.success : PALETTE.danger }}>
                  {' '}→ {formatCurrency(actual)}
                </span>
              )}
            </span>
          </div>
        ))}
      </div>
    </section>
  );
}
