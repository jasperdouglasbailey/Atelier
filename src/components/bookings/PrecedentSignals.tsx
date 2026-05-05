/**
 * Precedent signals panel — surfaces the corpus-backed signals named
 * in the master CLAUDE.md (rate delta, talent-client prior work,
 * client behavioural precedent).
 *
 * Visual rules:
 *   - confidence='low' (n<3) is rendered muted, prefixed with "thin
 *     data: " — never as authoritative.
 *   - confidence='ok' (3-9) is rendered normal weight.
 *   - confidence='strong' (≥10) is rendered with the accent colour.
 *   - When NO precedent exists at all the panel is suppressed (we
 *     don't show empty states; they're noise).
 */

import { PALETTE } from '@/lib/utils/constants';
import { formatCurrency } from '@/lib/utils/format';
import type { RateBand } from '@/lib/data/precedents';

type TalentClientHistoryRow = {
  bookingId: string;
  bookingRef: string | null;
  title: string;
  shootDateNotes: string | null;
  state: string;
  dayRate: number | null;
  grandTotal: number | null;
};

type ClientCorpusSignal = {
  count: number;
  wonCount: number;
  lostCount: number;
  medianGrandTotal: number | null;
  confidence: RateBand['confidence'];
};

export default function PrecedentSignals({
  talentBand,
  clientBand,
  talentClientHistory,
  clientCorpus,
  proposedDayRate,
  proposedGrandTotal,
}: {
  talentBand: RateBand | null;
  clientBand: RateBand | null;
  talentClientHistory: TalentClientHistoryRow[];
  clientCorpus: ClientCorpusSignal | null;
  proposedDayRate?: number | null;
  proposedGrandTotal?: number | null;
}) {
  const hasAny =
    (talentBand && talentBand.count > 0) ||
    (clientBand && clientBand.count > 0) ||
    talentClientHistory.length > 0 ||
    clientCorpus;

  if (!hasAny) return null;

  return (
    <section
      className="rounded-lg border p-4 space-y-3"
      style={{ background: PALETTE.surface, borderColor: PALETTE.border }}
    >
      <h3 className="text-xs font-semibold uppercase tracking-wide" style={{ color: PALETTE.muted }}>
        Precedent signals
      </h3>

      {talentClientHistory.length > 0 && (
        <Signal label="Talent–client prior work" confidence="strong">
          This artist has worked with this client {talentClientHistory.length} time
          {talentClientHistory.length === 1 ? '' : 's'} before.
          {' '}
          Last:{' '}
          <span style={{ color: PALETTE.text }}>
            {talentClientHistory[0].title}
            {talentClientHistory[0].dayRate ? ` · ${formatCurrency(talentClientHistory[0].dayRate)}/day` : ''}
          </span>
        </Signal>
      )}

      {talentBand && (
        <Signal label="Talent rate band" confidence={talentBand.confidence}>
          <RateBandLine band={talentBand} proposed={proposedDayRate ?? null} unit="/day" />
        </Signal>
      )}

      {clientBand && (
        <Signal label="Client total band" confidence={clientBand.confidence}>
          <RateBandLine band={clientBand} proposed={proposedGrandTotal ?? null} unit=" total" />
        </Signal>
      )}

      {clientCorpus && (
        <Signal label="Client history (corpus)" confidence={clientCorpus.confidence}>
          {clientCorpus.count} prior booking{clientCorpus.count === 1 ? '' : 's'} ·{' '}
          <span style={{ color: PALETTE.success }}>{clientCorpus.wonCount} won</span> ·{' '}
          <span style={{ color: PALETTE.danger }}>{clientCorpus.lostCount} lost</span>
          {clientCorpus.medianGrandTotal ? (
            <> · median {formatCurrency(clientCorpus.medianGrandTotal)}</>
          ) : null}
        </Signal>
      )}
    </section>
  );
}

function Signal({
  label,
  confidence,
  children,
}: {
  label: string;
  confidence: RateBand['confidence'];
  children: React.ReactNode;
}) {
  const isLow = confidence === 'low';
  const isStrong = confidence === 'strong';
  return (
    <div
      className="rounded border-l-2 pl-3 py-1"
      style={{
        borderColor: isStrong ? PALETTE.accent : isLow ? PALETTE.muted : PALETTE.border,
        opacity: isLow ? 0.65 : 1,
      }}
    >
      <div className="text-[10px] uppercase tracking-wide" style={{ color: PALETTE.muted }}>
        {label}{isLow ? ' · thin data' : ''}
      </div>
      <div className="text-xs mt-0.5" style={{ color: PALETTE.text }}>
        {children}
      </div>
    </div>
  );
}

function RateBandLine({
  band,
  proposed,
  unit,
}: {
  band: RateBand;
  proposed: number | null;
  unit: string;
}) {
  const deltaPct = proposed && band.median > 0
    ? ((proposed - band.median) / band.median) * 100
    : null;
  const deltaColor =
    deltaPct == null ? PALETTE.muted :
    Math.abs(deltaPct) < 10 ? PALETTE.muted :
    deltaPct > 0 ? PALETTE.warning : PALETTE.accent;

  return (
    <span>
      n={band.count} · median {formatCurrency(band.median)}{unit}
      {' '}({formatCurrency(band.min)}–{formatCurrency(band.max)})
      {deltaPct != null && (
        <>
          {' · '}
          <span style={{ color: deltaColor }}>
            {deltaPct > 0 ? '+' : ''}{deltaPct.toFixed(0)}% vs median
          </span>
        </>
      )}
    </span>
  );
}
