import Link from 'next/link';
import { PALETTE } from '@/lib/utils/constants';
import type { ReactNode } from 'react';

// Shared KPI card for overview pages (Dashboard, Reports, Compliance,
// Renewals, Costs). Single visual idiom across the app: small label,
// large number, optional sub-line. Compact (p-3) so 4 of them fit on
// one row at normal viewport widths.

export type KpiCardProps = {
  label: string;
  value: ReactNode;
  sub?: ReactNode;
  /** Click → href. If omitted, renders as static div. */
  href?: string;
  /** Highlights the card with the accent border. Use sparingly — for the one KPI
   *  the user should look at first. */
  accent?: boolean;
  /** Show a tinted background. Use for state-coded KPIs (red = critical etc.). */
  tone?: 'default' | 'success' | 'warn' | 'danger' | 'accent';
  /** Override the value text colour (e.g. green for healthy, red for over cap). */
  valueColor?: string;
};

const TONE_COLORS: Record<NonNullable<KpiCardProps['tone']>, { bg: string; border: string }> = {
  default: { bg: PALETTE.surface, border: PALETTE.border },
  success: { bg: `${PALETTE.success}10`, border: `${PALETTE.success}33` },
  warn:    { bg: `${PALETTE.warning}10`, border: `${PALETTE.warning}33` },
  danger:  { bg: `${PALETTE.danger}10`,  border: `${PALETTE.danger}33` },
  accent:  { bg: PALETTE.surface, border: PALETTE.accent },
};

export default function KpiCard({ label, value, sub, href, accent, tone = 'default', valueColor }: KpiCardProps) {
  const tones = TONE_COLORS[accent ? 'accent' : tone];
  const inner = (
    <>
      <div className="text-[10px] font-semibold uppercase tracking-wider" style={{ color: PALETTE.muted }}>
        {label}
      </div>
      <div
        className="mt-1 text-xl font-semibold tabular-nums leading-tight sm:text-2xl"
        style={{ color: valueColor ?? (accent ? PALETTE.accent : PALETTE.text) }}
      >
        {value}
      </div>
      {sub && (
        <div className="mt-1 text-[11px]" style={{ color: PALETTE.muted }}>
          {sub}
        </div>
      )}
    </>
  );

  if (href) {
    return (
      <Link
        href={href}
        className="block rounded-lg border p-3 transition hover:opacity-80"
        style={{ background: tones.bg, borderColor: tones.border }}
      >
        {inner}
      </Link>
    );
  }
  return (
    <div className="rounded-lg border p-3" style={{ background: tones.bg, borderColor: tones.border }}>
      {inner}
    </div>
  );
}

// Convenience wrapper for the most common layout: a horizontal strip of 4 KPI
// cards across the top of a page. Grid is 2-col on mobile, 4-col on lg+.
export function KpiStrip({ children }: { children: ReactNode }) {
  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-4">
      {children}
    </div>
  );
}
