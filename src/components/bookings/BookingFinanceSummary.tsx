import type { FeeLine, QuoteVersion } from '@/lib/types/database';
import { computeQuoteTotals, computeAgencyMargin } from '@/lib/utils/fee-engine';
import { formatCurrency } from '@/lib/utils/format';
import { PALETTE } from '@/lib/utils/constants';

type Props = {
  feeLines: FeeLine[];
  latestQuote: QuoteVersion | null;
  quoteVersionCount: number;
};

export default function BookingFinanceSummary({ feeLines, latestQuote, quoteVersionCount }: Props) {
  if (!latestQuote) return null;

  const totals = computeQuoteTotals(feeLines);
  const margin = computeAgencyMargin(totals);
  const marginPct = totals.grandTotal > 0
    ? ((margin.total / totals.grandTotal) * 100).toFixed(1)
    : null;
  const pnlPositive = margin.total >= 0;

  return (
    <div className="grid grid-cols-2 gap-4">
      {/* Quote card */}
      <div
        className="rounded-lg border p-4"
        style={{ background: PALETTE.surface, borderColor: PALETTE.border }}
      >
        <div className="text-[9px] font-semibold uppercase tracking-widest mb-2" style={{ color: PALETTE.muted }}>
          Quote
        </div>
        <div className="text-2xl font-semibold" style={{ color: PALETTE.text, fontFamily: 'Georgia, "Times New Roman", serif' }}>
          {formatCurrency(latestQuote.grand_total ?? totals.grandTotal, 'AUD')}
        </div>
        <div className="mt-1 text-[11px]" style={{ color: PALETTE.muted }}>
          v{quoteVersionCount}
          {latestQuote.status === 'approved' ? ' · approved' : latestQuote.status === 'sent' ? ' · sent' : ''}
        </div>
      </div>

      {/* P&L card */}
      <div
        className="rounded-lg border p-4"
        style={{ background: PALETTE.surface, borderColor: PALETTE.border }}
      >
        <div className="text-[9px] font-semibold uppercase tracking-widest mb-2" style={{ color: PALETTE.muted }}>
          Job P&amp;L
        </div>
        {feeLines.length > 0 ? (
          <>
            <div
              className="text-2xl font-semibold"
              style={{
                color: pnlPositive ? PALETTE.success : PALETTE.danger,
                fontFamily: 'Georgia, "Times New Roman", serif',
              }}
            >
              {pnlPositive ? '+' : ''}{formatCurrency(margin.total, 'AUD')}
            </div>
            <div className="mt-1 text-[11px]" style={{ color: PALETTE.muted }}>
              margin{marginPct ? ` · ${marginPct}%` : ''}
            </div>
          </>
        ) : (
          <div className="text-sm" style={{ color: PALETTE.muted }}>No fee lines yet</div>
        )}
      </div>
    </div>
  );
}
