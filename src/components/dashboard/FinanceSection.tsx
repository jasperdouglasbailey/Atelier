import Link from 'next/link';
import { PALETTE } from '@/lib/utils/constants';
import { formatCurrency } from '@/lib/utils/format';
import SectionCard from '@/components/ui/SectionCard';

/**
 * Finance snapshot — replaces the three "This week / This month / YTD"
 * top-of-page KPI cards with a dedicated section that has more breathing
 * room and adds overdue.
 *
 * Clicks through to /reports for the full breakdown.
 */
export default function FinanceSection({
  revenueThisWeek,
  revenueThisMonth,
  revenueLastMonth,
  revenueThisYear,
  avgBookingValue,
  overdueTotal,
  overdueCount,
  className,
}: {
  revenueThisWeek: number;
  revenueThisMonth: number;
  revenueLastMonth: number;
  revenueThisYear: number;
  avgBookingValue: number;
  overdueTotal: number;
  overdueCount: number;
  className?: string;
}) {
  const monthDelta = revenueLastMonth > 0
    ? ((revenueThisMonth - revenueLastMonth) / revenueLastMonth) * 100
    : null;

  return (
    <SectionCard
      title="Finance"
      action={{ label: 'Reports', href: '/reports' }}
      className={className}
    >
      <div className="grid gap-3 grid-cols-2 sm:grid-cols-4 h-full">
        <Metric
          label="This week"
          value={formatCurrency(revenueThisWeek)}
          sub="confirmed shoots"
        />
        <Metric
          label="This month"
          value={formatCurrency(revenueThisMonth)}
          sub={
            monthDelta === null ? (
              <span style={{ color: PALETTE.muted }}>no prior month</span>
            ) : (
              <span style={{ color: monthDelta >= 0 ? PALETTE.success : PALETTE.danger }}>
                {monthDelta >= 0 ? '↑' : '↓'}{Math.abs(monthDelta).toFixed(0)}% vs last
              </span>
            )
          }
          accent
        />
        <Metric
          label="Year to date"
          value={formatCurrency(revenueThisYear)}
          sub={`avg ${formatCurrency(avgBookingValue)}/booking`}
        />
        {overdueCount > 0 ? (
          <Link
            href="/bookings?state=invoice_issued"
            className="rounded-md border p-3 transition hover:opacity-80"
            style={{ background: `${PALETTE.danger}10`, borderColor: `${PALETTE.danger}44` }}
          >
            <div className="text-[10px] uppercase tracking-wider" style={{ color: PALETTE.muted }}>
              Overdue
            </div>
            <div
              className="mt-1 text-xl font-semibold tabular-nums sm:text-2xl"
              style={{ color: PALETTE.danger }}
            >
              {formatCurrency(overdueTotal)}
            </div>
            <div className="mt-1 text-[11px]" style={{ color: PALETTE.muted }}>
              {overdueCount} invoice{overdueCount !== 1 ? 's' : ''} past due
            </div>
          </Link>
        ) : (
          <Metric
            label="Overdue"
            value={<span style={{ color: PALETTE.success }}>None</span>}
            sub="all invoices on track"
          />
        )}
      </div>
    </SectionCard>
  );
}

function Metric({
  label, value, sub, accent,
}: {
  label: string;
  value: React.ReactNode;
  sub?: React.ReactNode;
  accent?: boolean;
}) {
  return (
    <div
      className="rounded-md border p-3"
      style={{ background: PALETTE.bg, borderColor: accent ? PALETTE.accent : PALETTE.border }}
    >
      <div className="text-[10px] uppercase tracking-wider" style={{ color: PALETTE.muted }}>
        {label}
      </div>
      <div
        className="mt-1 text-xl font-semibold tabular-nums sm:text-2xl"
        style={{ color: accent ? PALETTE.accent : PALETTE.text }}
      >
        {value}
      </div>
      {sub && (
        <div className="mt-1 text-[11px]" style={{ color: PALETTE.muted }}>{sub}</div>
      )}
    </div>
  );
}
