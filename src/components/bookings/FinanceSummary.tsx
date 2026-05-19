'use client';

/**
 * Finance summary panel rendered at the bottom of the QuoteBuilder.
 *
 * Three sections, in this order:
 *   1. Four metric tiles (Subtotals / ASF / GST / Super) — always visible.
 *   2. Per-line read-only table with footer totals + grand total row.
 *   3. Collapsible "Where every dollar goes" — three coloured highlight
 *      blocks (Amber/Agency keeps · Blue/ATO · Teal/Paid through) plus a
 *      reconciliation strip that ties back to the grand total.
 *
 * The collapsible section uses `computeGstDestinations` to break out
 * per-person passthroughs. A line with a GST-registered talent or crew
 * linked passes the cost-portion of its GST through to that person and
 * keeps the agency-side spread + ASF GST on the ATO bucket. Doctrine
 * details in `fee-engine.ts:computeGstDestinations`.
 *
 * Visual style is fixed per the spec: amber/blue/teal ramps, 12px card
 * radius, fixed-layout table at 13px font. All numbers computed live —
 * no hardcoded figures.
 */

import { useState } from 'react';
import type { FeeLine, BookingTalent, BookingCrew } from '@/lib/types/database';
import {
  computeAgencyMargin,
  computeGstDestinations,
  type QuoteTotals,
} from '@/lib/utils/fee-engine';
import { FEE_LINE_TYPE_LABELS, GST_RATE, DEFAULT_ASF_RATE, DEFAULT_COMMISSION_RATE, SUPER_RATE_CHARGED, SUPER_RATE_PAID } from '@/lib/utils/constants';
import { formatCurrency } from '@/lib/utils/format';

// ── Palette (spec-fixed) ──────────────────────────────────────────────
// Inlined rather than added to PALETTE — these tones are specific to the
// finance breakdown and don't compose with the rest of the design system.
const TONES = {
  amber: { bg: '#FAEEDA', tintBg: '#FAEEDA66', text: '#854F0B', accent: '#BA7517' },
  blue:  { bg: '#E6F1FB', tintBg: '#E6F1FB66', text: '#0C447C', accent: '#185FA5' },
  teal:  { bg: '#E1F5EE', tintBg: '#E1F5EE66', text: '#085041', accent: '#0F6E56' },
  neg:   '#993C1D',
  ok:    '#1D9E75',
  card:  '#FFFFFF',
  cardBorder: 'rgba(0,0,0,0.08)',
  surface: '#F7F5EF',
  muted: '#6B6B6B',
  text: '#1B1B1B',
} as const;

const CARD_STYLE: React.CSSProperties = {
  borderRadius: 12,
  border: `0.5px solid ${TONES.cardBorder}`,
  background: TONES.card,
};

type Props = {
  feeLines: Partial<FeeLine>[];
  /** Pre-computed totals (matches the live preview when a row is being edited upstream). */
  totals: QuoteTotals;
  bookingTalent: BookingTalent[];
  bookingCrew: BookingCrew[];
};

export default function FinanceSummary({ feeLines, totals, bookingTalent, bookingCrew }: Props) {
  const [open, setOpen] = useState(false);

  // ── Tile metadata: which lines contribute, rate description ────────
  // ASF: count lines where asf_rate is set and > 0 — gives an honest
  // "3 of 4 lines" subtitle. Rate description picks the most-common rate
  // (almost always 15%) so the subtitle reads "@ 15%", not a list of
  // every rate present.
  const totalLines = feeLines.length;
  const asfLineCount = feeLines.filter((l) => (l.asf_rate ?? DEFAULT_ASF_RATE) > 0).length;
  const gstLineCount = feeLines.filter((l) => !l.is_gst_exempt).length;
  const superLines = feeLines.filter((l) => l.is_super_bearing);
  const superLineCount = superLines.length;

  // ── Per-line computed view for the table ───────────────────────────
  // `totals.lines` aligns with the preview-supplied feeLines order.
  const computedRows = feeLines.map((line, i) => ({
    line,
    c: totals.lines[i],
  }));

  // ── "Where every dollar goes" buckets ──────────────────────────────
  const margin = computeAgencyMargin(totals);
  const destinations = computeGstDestinations({
    lines: feeLines,
    totals,
    parties: {
      bookingTalent,
      bookingCrew,
    },
  });

  // Paid through = grand total − agency keeps − ATO − passthroughs.
  // This residual is what flows out to artists/crew/vendors (line
  // subtotals net of commission/commission GST, plus super paid).
  const paidThrough = r2(
    totals.grandTotal
    - margin.total
    - destinations.netToAto
    - destinations.totalPassthrough,
  );

  // ── "Paid through" rows: subtotals − commission − commission GST + super paid + passthroughs ──
  // Signed entries — must sum to the bucket total.
  const paidThroughRows: Array<{ label: string; value: number }> = [
    { label: 'Line subtotals (billed before ASF + GST)', value: totals.subtotal },
    margin.commission > 0 && { label: '− Commission kept by agency', value: -margin.commission },
    totals.totalCommissionGst > 0 && { label: '− Commission GST owed to ATO', value: -totals.totalCommissionGst },
    totals.totalSuperPaid > 0 && { label: `+ Super paid to fund · ${pct(SUPER_RATE_PAID)}`, value: totals.totalSuperPaid },
    ...destinations.passthroughs.map((p) => ({
      label: `+ GST passed to ${p.name}${p.roleLabel ? ` · ${p.roleLabel}` : ''}`,
      value: p.amount,
    })),
  ].filter(Boolean) as Array<{ label: string; value: number }>;

  return (
    <section className="space-y-4">
      {/* ════════════════════════════════════════════════════════════════
          1. Four metric tiles
          ════════════════════════════════════════════════════════════════ */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <MetricTile
          label="Line subtotals"
          value={totals.subtotal}
          subtitle={`${totalLines} line${totalLines === 1 ? '' : 's'}`}
          tone="neutral"
        />
        <MetricTile
          label="ASF"
          value={totals.totalAsf}
          subtitle={
            asfLineCount === 0
              ? 'no lines'
              : `${asfLineCount === totalLines ? `all ${totalLines}` : `${asfLineCount} of ${totalLines}`} line${asfLineCount === 1 ? '' : 's'} · ${pct(DEFAULT_ASF_RATE)}`
          }
          tone="amber"
        />
        <MetricTile
          label="GST"
          value={totals.totalGst}
          subtitle={
            gstLineCount === 0
              ? 'all lines exempt'
              : `${gstLineCount === totalLines ? `all ${totalLines}` : `${gstLineCount} of ${totalLines}`} line${gstLineCount === 1 ? '' : 's'} · ${pct(GST_RATE)}`
          }
          tone="blue"
        />
        <MetricTile
          label="Super"
          value={totals.totalSuper}
          subtitle={
            superLineCount === 0
              ? 'no super-bearing lines'
              : `crew labour · ${pct(SUPER_RATE_CHARGED)} charged / ${pct(SUPER_RATE_PAID)} paid`
          }
          tone="teal"
        />
      </div>

      {/* ════════════════════════════════════════════════════════════════
          2. Per-line table
          ════════════════════════════════════════════════════════════════ */}
      <div style={CARD_STYLE}>
        <div className="overflow-x-auto">
          <table style={{ width: '100%', tableLayout: 'fixed', fontSize: 13, color: TONES.text }}>
            <colgroup>
              <col />
              <col style={{ width: 110 }} />
              <col style={{ width: 110 }} />
              <col style={{ width: 110 }} />
              <col style={{ width: 110 }} />
              <col style={{ width: 130 }} />
            </colgroup>
            <thead>
              <tr style={{ background: TONES.surface }}>
                <Th align="left">Line</Th>
                <Th align="right">Subtotal</Th>
                <Th align="right" color={TONES.amber.accent}>ASF</Th>
                <Th align="right" color={TONES.blue.accent}>GST</Th>
                <Th align="right" color={TONES.teal.accent}>Super</Th>
                <Th align="right">Line total</Th>
              </tr>
            </thead>
            <tbody>
              {computedRows.map(({ line, c }, i) => {
                if (!c) return null;
                const typeLabel = line.line_type ? FEE_LINE_TYPE_LABELS[line.line_type] : '—';
                return (
                  <tr key={i} style={{ borderTop: `1px solid ${TONES.cardBorder}` }}>
                    <td style={{ padding: '8px 12px' }}>
                      <div style={{ color: TONES.text }}>{line.description || '—'}</div>
                      <div style={{ fontSize: 11, color: TONES.muted, marginTop: 2 }}>{typeLabel}</div>
                    </td>
                    <Td>{formatCurrency(c.subtotal)}</Td>
                    <Td color={c.asfAmount > 0 ? TONES.amber.accent : TONES.muted}>
                      {c.asfAmount > 0 ? formatCurrency(c.asfAmount) : '—'}
                    </Td>
                    <Td color={c.gstAmount > 0 ? TONES.blue.accent : TONES.muted}>
                      {c.gstAmount > 0 ? formatCurrency(c.gstAmount) : '—'}
                    </Td>
                    <Td color={c.superChargedAmount > 0 ? TONES.teal.accent : TONES.muted}>
                      {c.superChargedAmount > 0 ? formatCurrency(c.superChargedAmount) : '—'}
                    </Td>
                    <Td bold>
                      {formatCurrency(r2(c.lineTotal + c.superChargedAmount))}
                    </Td>
                  </tr>
                );
              })}
            </tbody>
            <tfoot>
              <tr style={{ background: TONES.surface, borderTop: `1px solid ${TONES.cardBorder}` }}>
                <Th align="left">Totals</Th>
                <Td bold>{formatCurrency(totals.subtotal)}</Td>
                <Td bold color={TONES.amber.accent}>{formatCurrency(totals.totalAsf)}</Td>
                <Td bold color={TONES.blue.accent}>{formatCurrency(totals.totalGst)}</Td>
                <Td bold color={TONES.teal.accent}>{formatCurrency(totals.totalSuper)}</Td>
                <Td bold>{formatCurrency(totals.grandTotal)}</Td>
              </tr>
            </tfoot>
          </table>
        </div>
        {/* Grand total strip on the same card. */}
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'baseline',
            padding: '14px 16px',
            borderTop: `1px solid ${TONES.cardBorder}`,
          }}
        >
          <span style={{ fontSize: 12, fontWeight: 600, letterSpacing: '0.06em', textTransform: 'uppercase', color: TONES.muted }}>
            Grand total incl. GST
          </span>
          <span style={{ fontSize: 24, fontWeight: 700, color: TONES.text, fontVariantNumeric: 'tabular-nums' }}>
            {formatCurrency(totals.grandTotal)}
          </span>
        </div>
      </div>

      {/* ════════════════════════════════════════════════════════════════
          3. Collapsible "Where every dollar goes"
          ════════════════════════════════════════════════════════════════ */}
      <div style={CARD_STYLE}>
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          aria-expanded={open}
          style={{
            width: '100%',
            textAlign: 'left',
            padding: '12px 16px',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            background: 'transparent',
            border: 'none',
            cursor: 'pointer',
            color: TONES.text,
            fontFamily: 'inherit',
          }}
        >
          <span style={{ fontSize: 12, fontWeight: 600, letterSpacing: '0.06em', textTransform: 'uppercase' }}>
            Where every dollar goes <span style={{ color: TONES.muted, fontWeight: 400 }}>· agency · ATO · paythrough</span>
          </span>
          <span
            aria-hidden
            style={{
              display: 'inline-block',
              transition: 'transform 0.2s ease',
              transform: open ? 'rotate(90deg)' : 'rotate(0deg)',
              color: TONES.muted,
              fontSize: 14,
            }}
          >
            ▸
          </span>
        </button>
        <div
          style={{
            overflow: 'hidden',
            maxHeight: open ? 4000 : 0,
            transition: 'max-height 0.3s ease',
          }}
        >
          <div style={{ padding: '0 16px 16px', display: 'flex', flexDirection: 'column', gap: 12 }}>
            {/* AMBER — Agency keeps */}
            <DestBlock
              tone={TONES.amber}
              label="Agency keeps"
              total={margin.total}
              rows={[
                margin.commission > 0 && { l: `Commission · ${pct(DEFAULT_COMMISSION_RATE)} on artist labour`, v: margin.commission },
                margin.asf > 0 && { l: 'ASF · collected from all lines', v: margin.asf },
                margin.superSpread > 0 && { l: `Super spread · ${pct(SUPER_RATE_CHARGED)} charged − ${pct(SUPER_RATE_PAID)} paid × crew labour`, v: margin.superSpread },
                margin.spreadCaptured > 0 && { l: 'Spread captured (cost < billed)', v: margin.spreadCaptured },
              ]}
              calcSummary={summarise([
                margin.commission > 0 && margin.commission,
                margin.asf > 0 && margin.asf,
                margin.superSpread > 0 && margin.superSpread,
                margin.spreadCaptured > 0 && margin.spreadCaptured,
              ], margin.total)}
            />

            {/* BLUE — Owed to ATO · net GST */}
            <DestBlock
              tone={TONES.blue}
              label="Owed to ATO · net GST"
              total={destinations.netToAto}
              rows={[
                destinations.atoFromAgencyLines > 0 && { l: `GST on agency-only lines · ${pct(GST_RATE)} × (subtotals + ASF)`, v: destinations.atoFromAgencyLines },
                destinations.atoFromAgencySpreadOnPersonLines > 0 && { l: 'GST on agency-side ASF / spread of person-linked lines', v: destinations.atoFromAgencySpreadOnPersonLines },
                destinations.atoFromNonRegisteredPersonLines > 0 && { l: 'GST on lines where linked person is not GST-registered', v: destinations.atoFromNonRegisteredPersonLines },
                destinations.atoFromCommission > 0 && { l: `GST on agency commission income · ${pct(GST_RATE)} × commission`, v: destinations.atoFromCommission },
              ]}
              calcSummary={summarise([
                destinations.atoFromAgencyLines > 0 && destinations.atoFromAgencyLines,
                destinations.atoFromAgencySpreadOnPersonLines > 0 && destinations.atoFromAgencySpreadOnPersonLines,
                destinations.atoFromNonRegisteredPersonLines > 0 && destinations.atoFromNonRegisteredPersonLines,
                destinations.atoFromCommission > 0 && destinations.atoFromCommission,
              ], destinations.netToAto)}
            />

            {/* TEAL — Paid through to team + vendors */}
            <DestBlock
              tone={TONES.teal}
              label="Paid through to team + vendors"
              total={paidThrough + destinations.totalPassthrough}
              rows={paidThroughRows.map((r) => ({ l: r.label, v: r.value }))}
              calcSummary={summariseSigned(paidThroughRows.map((r) => r.value), paidThrough + destinations.totalPassthrough)}
              allowNegative
            />

            {/* Reconciliation strip — ties back to grand total */}
            <Reconciliation
              parts={[
                { label: 'Agency keeps', amount: margin.total, color: TONES.amber.accent },
                { label: 'ATO', amount: destinations.netToAto, color: TONES.blue.accent },
                { label: 'Paid through', amount: paidThrough + destinations.totalPassthrough, color: TONES.teal.accent },
              ]}
              grandTotal={totals.grandTotal}
            />
          </div>
        </div>
      </div>
    </section>
  );
}

// ============================================================
// Sub-components
// ============================================================

function MetricTile({
  label, value, subtitle, tone,
}: {
  label: string;
  value: number;
  subtitle: string;
  tone: 'neutral' | 'amber' | 'blue' | 'teal';
}) {
  const palette = tone === 'amber' ? TONES.amber
    : tone === 'blue' ? TONES.blue
    : tone === 'teal' ? TONES.teal
    : null;

  const background = palette ? palette.bg : TONES.surface;
  const textColor = palette ? palette.text : TONES.text;
  const accentColor = palette ? palette.accent : TONES.muted;

  return (
    <div style={{ borderRadius: 8, background, padding: '12px 14px' }}>
      <div style={{ fontSize: 10, fontWeight: 600, letterSpacing: '0.08em', textTransform: 'uppercase', color: accentColor }}>
        {label}
      </div>
      <div style={{ fontSize: 22, fontWeight: 700, color: textColor, fontVariantNumeric: 'tabular-nums', marginTop: 4 }}>
        {formatCurrency(value)}
      </div>
      <div style={{ fontSize: 11, color: accentColor, marginTop: 2, opacity: 0.85 }}>
        {subtitle}
      </div>
    </div>
  );
}

type Tone = { bg: string; tintBg: string; text: string; accent: string };

function DestBlock({
  tone, label, total, rows, calcSummary, allowNegative = false,
}: {
  tone: Tone;
  label: string;
  total: number;
  rows: Array<false | 0 | null | undefined | { l: string; v: number }>;
  calcSummary: string | null;
  allowNegative?: boolean;
}) {
  const realRows = rows.filter(Boolean) as Array<{ l: string; v: number }>;
  return (
    <div style={{ borderRadius: 10, background: tone.bg, padding: '12px 14px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 8 }}>
        <span style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: tone.text }}>
          {label}
        </span>
        <span style={{ fontSize: 22, fontWeight: 700, color: tone.text, fontVariantNumeric: 'tabular-nums' }}>
          {formatCurrency(total)}
        </span>
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
        {realRows.map((r, i) => {
          const isNeg = r.v < 0;
          const display = Math.abs(r.v);
          const color = isNeg && allowNegative ? TONES.neg : tone.accent;
          return (
            <div
              key={i}
              style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', fontSize: 12 }}
            >
              <span style={{ color: tone.text, opacity: 0.85 }}>{r.l}</span>
              <span style={{ color, fontVariantNumeric: 'tabular-nums' }}>
                {isNeg ? '−' : ''}{formatCurrency(display)}
              </span>
            </div>
          );
        })}
      </div>
      {calcSummary && (
        <div style={{ marginTop: 8, fontSize: 11, fontStyle: 'italic', color: tone.accent, opacity: 0.9 }}>
          {calcSummary}
        </div>
      )}
    </div>
  );
}

function Reconciliation({
  parts, grandTotal,
}: {
  parts: Array<{ label: string; amount: number; color: string }>;
  grandTotal: number;
}) {
  const sum = r2(parts.reduce((s, p) => s + p.amount, 0));
  const balanced = Math.abs(sum - grandTotal) < 0.01;
  return (
    <div
      style={{
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'baseline',
        padding: '10px 12px',
        borderRadius: 8,
        background: TONES.surface,
        fontSize: 12,
        fontVariantNumeric: 'tabular-nums',
        flexWrap: 'wrap',
        gap: 8,
      }}
    >
      <span style={{ color: TONES.muted }}>
        {parts.map((p, i) => (
          <span key={p.label}>
            <span style={{ color: p.color, fontWeight: 600 }}>{formatCurrency(p.amount)}</span>
            {i < parts.length - 1 && <span style={{ margin: '0 6px' }}>+</span>}
          </span>
        ))}
      </span>
      <span style={{ fontWeight: 700, color: balanced ? TONES.ok : TONES.neg }}>
        = {formatCurrency(sum)} {balanced ? '✓' : '✗'}
      </span>
    </div>
  );
}

function Th({ children, align = 'left', color }: { children: React.ReactNode; align?: 'left' | 'right'; color?: string }) {
  return (
    <th
      style={{
        padding: '10px 12px',
        textAlign: align,
        fontSize: 11,
        fontWeight: 600,
        letterSpacing: '0.06em',
        textTransform: 'uppercase',
        color: color ?? TONES.muted,
      }}
    >
      {children}
    </th>
  );
}

function Td({ children, color, bold }: { children: React.ReactNode; color?: string; bold?: boolean }) {
  return (
    <td
      style={{
        padding: '8px 12px',
        textAlign: 'right',
        fontVariantNumeric: 'tabular-nums',
        color: color ?? TONES.text,
        fontWeight: bold ? 600 : 400,
      }}
    >
      {children}
    </td>
  );
}

// ============================================================
// Tiny helpers
// ============================================================

/** Round to 2 decimal places (mirrors fee-engine's r2 — kept private to avoid export pollution). */
function r2(n: number): number {
  return Math.round(n * 100) / 100;
}

/** Format a 0–1 fraction as "15%". */
function pct(n: number): string {
  return `${Math.round(n * 100)}%`;
}

/** Build an italic "A + B + C = T" calc summary from non-zero components. */
function summarise(parts: Array<false | 0 | null | undefined | number>, total: number): string | null {
  const real = parts.filter((p): p is number => typeof p === 'number' && p !== 0);
  if (real.length === 0) return null;
  const expr = real.map((v) => formatCurrency(v)).join(' + ');
  return `${expr} = ${formatCurrency(total)}`;
}

/** Build a signed "A − B + C = T" calc summary preserving signs. */
function summariseSigned(parts: number[], total: number): string | null {
  if (parts.length === 0) return null;
  const tokens: string[] = [];
  parts.forEach((v, i) => {
    if (v === 0) return;
    const abs = Math.abs(v);
    if (i === 0) tokens.push(`${v < 0 ? '−' : ''}${formatCurrency(abs)}`);
    else tokens.push(`${v < 0 ? '− ' : '+ '}${formatCurrency(abs)}`);
  });
  if (tokens.length === 0) return null;
  return `${tokens.join(' ')} = ${formatCurrency(total)}`;
}
