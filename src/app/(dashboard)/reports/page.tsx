import Topbar from '@/components/layout/Topbar';
import Link from 'next/link';
import {
  getReportSummary, getMonthlyRevenue, getStateBreakdown, getTierBreakdown, getTopClients,
  getWinRate, getTopTalent,
} from '@/lib/data/reports';
import { BOOKING_STATE_LABELS, SHOOT_TIER_LABELS, PALETTE, STATE_COLORS } from '@/lib/utils/constants';
import { formatCurrency } from '@/lib/utils/format';
import type { BookingState, ShootTier } from '@/lib/types/database';
import KpiCard, { KpiStrip } from '@/components/ui/KpiCard';
import SectionCard from '@/components/ui/SectionCard';

export default async function ReportsPage() {
  const [summary, monthly, stateBreakdown, tierBreakdown, topClients, winRate, topTalent] = await Promise.all([
    getReportSummary(),
    getMonthlyRevenue(12),
    getStateBreakdown(),
    getTierBreakdown(),
    getTopClients(8),
    getWinRate(),
    getTopTalent(8),
  ]);

  const maxMonthlyRevenue = Math.max(...monthly.map((m) => m.grandTotal), 1);
  const maxTierRevenue = Math.max(...tierBreakdown.map((t) => t.grandTotal), 1);
  const maxClientRevenue = Math.max(...topClients.map((c) => c.grandTotal), 1);
  const maxTalentBookings = Math.max(...topTalent.map((t) => t.bookingCount), 1);

  const winPct = Math.round(winRate.winRate * 100);

  return (
    <>
      <Topbar title="Reports" />
      <div className="p-4 sm:p-6 space-y-4">

        {/* KPI strip */}
        <KpiStrip>
          <KpiCard
            label="Active bookings"
            value={summary.totalActiveBookings}
          />
          <KpiCard
            label="Revenue this month"
            value={formatCurrency(summary.revenueThisMonth)}
            sub={`Last mo: ${formatCurrency(summary.revenueLastMonth)}`}
            accent
          />
          <KpiCard
            label="Revenue YTD"
            value={formatCurrency(summary.revenueThisYear)}
            sub={`All time: ${formatCurrency(summary.totalRevenueAllTime)}`}
          />
          <KpiCard
            label="Avg booking"
            value={formatCurrency(summary.avgBookingValue)}
          />
        </KpiStrip>

        {/* Win rate + 12-month chart — side by side on lg */}
        <div className="grid gap-4 lg:grid-cols-3">
          <SectionCard title="Quote conversion" className="lg:col-span-1">
            <div className="space-y-4">
              <div>
                <div className="text-[10px] uppercase tracking-wider" style={{ color: PALETTE.muted }}>Win rate</div>
                <div
                  className="mt-1 text-3xl font-semibold tabular-nums"
                  style={{ color: winRate.winRate >= 0.5 ? PALETTE.success : PALETTE.warning }}
                >
                  {winRate.winRate > 0 ? `${winPct}%` : '—'}
                </div>
                <div className="text-[10px] mt-0.5" style={{ color: PALETTE.muted }}>of decided quotes</div>
              </div>

              {winRate.confirmed + winRate.lost > 0 && (
                <div className="h-2 w-full rounded overflow-hidden" style={{ background: `${PALETTE.danger}20` }}>
                  <div
                    className="h-full"
                    style={{ width: `${winPct}%`, background: PALETTE.success }}
                  />
                </div>
              )}

              <div className="grid grid-cols-3 gap-2">
                {[
                  { label: 'Sent',      value: winRate.sent,      color: PALETTE.text },
                  { label: 'Confirmed', value: winRate.confirmed, color: PALETTE.success },
                  { label: 'Lost',      value: winRate.lost,      color: PALETTE.danger },
                ].map(({ label, value, color }) => (
                  <div key={label}>
                    <div className="text-[10px] uppercase tracking-wider" style={{ color: PALETTE.muted }}>{label}</div>
                    <div className="text-lg font-semibold tabular-nums" style={{ color }}>{value}</div>
                  </div>
                ))}
              </div>
            </div>
          </SectionCard>

          <SectionCard title="Revenue — last 12 months" className="lg:col-span-2">
            {monthly.length === 0 ? (
              <p className="text-xs" style={{ color: PALETTE.muted }}>No bookings in this period.</p>
            ) : (
              <div className="space-y-1.5">
                {monthly.map((m) => {
                  const [yr, mo] = m.month.split('-');
                  const monthLabel = new Date(`${yr}-${mo}-01`).toLocaleDateString('en-AU', { month: 'short', year: '2-digit' });
                  const barPct = maxMonthlyRevenue > 0 ? (m.grandTotal / maxMonthlyRevenue) * 100 : 0;
                  return (
                    <div key={m.month} className="flex items-center gap-2">
                      <div className="text-[10px] w-11 text-right flex-shrink-0 tabular-nums" style={{ color: PALETTE.muted }}>{monthLabel}</div>
                      <div className="flex-1 h-4 rounded overflow-hidden" style={{ background: `${PALETTE.accent}15` }}>
                        <div
                          className="h-full"
                          style={{ width: `${barPct}%`, background: PALETTE.accent, minWidth: m.grandTotal > 0 ? 2 : 0 }}
                        />
                      </div>
                      <div className="text-[11px] w-20 flex-shrink-0 tabular-nums text-right" style={{ color: PALETTE.text }}>
                        {m.grandTotal > 0 ? formatCurrency(m.grandTotal) : '—'}
                      </div>
                      <div className="text-[10px] w-6 text-right tabular-nums" style={{ color: PALETTE.muted }}>×{m.bookingCount}</div>
                    </div>
                  );
                })}
              </div>
            )}
          </SectionCard>
        </div>

        {/* Breakdowns grid */}
        <div className="grid gap-4 lg:grid-cols-2 xl:grid-cols-4">
          <SectionCard title="Bookings by state">
            {stateBreakdown.length === 0 ? (
              <p className="text-xs" style={{ color: PALETTE.muted }}>No bookings yet.</p>
            ) : (
              <div className="space-y-1.5">
                {stateBreakdown.map(({ state, count }) => {
                  const total = stateBreakdown.reduce((s, r) => s + r.count, 0);
                  const pct = total > 0 ? (count / total) * 100 : 0;
                  const color = STATE_COLORS[state as BookingState] ?? PALETTE.muted;
                  return (
                    <div key={state} className="flex items-center gap-2">
                      <div className="text-[11px] flex-1 truncate" style={{ color: PALETTE.text }}>
                        {BOOKING_STATE_LABELS[state as BookingState] ?? state}
                      </div>
                      <div className="w-14 h-2 rounded overflow-hidden flex-shrink-0" style={{ background: `${color}20` }}>
                        <div className="h-full" style={{ width: `${pct}%`, background: color }} />
                      </div>
                      <div className="text-[11px] w-5 text-right tabular-nums" style={{ color: PALETTE.muted }}>{count}</div>
                    </div>
                  );
                })}
              </div>
            )}
          </SectionCard>

          <SectionCard title="Revenue by tier">
            {tierBreakdown.length === 0 ? (
              <p className="text-xs" style={{ color: PALETTE.muted }}>No data yet.</p>
            ) : (
              <div className="space-y-2">
                {tierBreakdown.map(({ tier, count, grandTotal }) => {
                  const barPct = maxTierRevenue > 0 ? (grandTotal / maxTierRevenue) * 100 : 0;
                  return (
                    <div key={tier}>
                      <div className="flex justify-between text-[11px]">
                        <span className="truncate" style={{ color: PALETTE.text }}>{SHOOT_TIER_LABELS[tier as ShootTier] ?? tier}</span>
                        <span className="tabular-nums ml-2 flex-shrink-0" style={{ color: PALETTE.muted }}>
                          {count} · {grandTotal > 0 ? formatCurrency(grandTotal) : '—'}
                        </span>
                      </div>
                      <div className="mt-0.5 h-1.5 rounded overflow-hidden" style={{ background: `${PALETTE.success}15` }}>
                        <div className="h-full" style={{ width: `${barPct}%`, background: PALETTE.success }} />
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </SectionCard>

          <SectionCard
            title="Top clients"
            action={{ label: 'All', href: '/clients' }}
          >
            {topClients.length === 0 ? (
              <p className="text-xs" style={{ color: PALETTE.muted }}>No client data yet.</p>
            ) : (
              <div className="space-y-1.5">
                {topClients.map(({ clientId, clientName, grandTotal }, i) => {
                  const barPct = maxClientRevenue > 0 ? (grandTotal / maxClientRevenue) * 100 : 0;
                  return (
                    <div key={clientId} className="flex items-center gap-2">
                      <div className="text-[10px] w-4 text-right flex-shrink-0 tabular-nums" style={{ color: PALETTE.muted }}>#{i + 1}</div>
                      <Link
                        href={`/clients/${clientId}`}
                        className="text-[11px] font-medium flex-1 truncate hover:underline"
                        style={{ color: PALETTE.text }}
                      >
                        {clientName}
                      </Link>
                      <div className="w-12 h-2 rounded overflow-hidden flex-shrink-0" style={{ background: `${PALETTE.accent}15` }}>
                        <div className="h-full" style={{ width: `${barPct}%`, background: PALETTE.accent }} />
                      </div>
                      <div className="text-[11px] tabular-nums text-right" style={{ color: PALETTE.text, minWidth: 56 }}>
                        {grandTotal > 0 ? formatCurrency(grandTotal) : '—'}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </SectionCard>

          <SectionCard
            title="Top artists"
            action={{ label: 'All', href: '/talent' }}
          >
            {topTalent.length === 0 ? (
              <p className="text-xs" style={{ color: PALETTE.muted }}>No artist data yet.</p>
            ) : (
              <div className="space-y-1.5">
                {topTalent.map(({ talentId, name, bookingCount }, i) => {
                  const barPct = maxTalentBookings > 0 ? (bookingCount / maxTalentBookings) * 100 : 0;
                  return (
                    <div key={talentId} className="flex items-center gap-2">
                      <div className="text-[10px] w-4 text-right flex-shrink-0 tabular-nums" style={{ color: PALETTE.muted }}>#{i + 1}</div>
                      <Link
                        href={`/talent/${talentId}`}
                        className="text-[11px] font-medium flex-1 truncate hover:underline"
                        style={{ color: PALETTE.text }}
                      >
                        {name}
                      </Link>
                      <div className="flex-1 h-2 rounded overflow-hidden" style={{ background: `${PALETTE.accent}15` }}>
                        <div className="h-full" style={{ width: `${barPct}%`, background: PALETTE.accent }} />
                      </div>
                      <div className="text-[10px] w-7 text-right tabular-nums" style={{ color: PALETTE.text }}>×{bookingCount}</div>
                    </div>
                  );
                })}
              </div>
            )}
          </SectionCard>
        </div>

      </div>
    </>
  );
}
