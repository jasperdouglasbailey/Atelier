import Topbar from '@/components/layout/Topbar';
import Link from 'next/link';
import {
  getReportSummary, getMonthlyRevenue, getStateBreakdown, getTierBreakdown, getTopClients,
  getWinRate, getTopTalent,
} from '@/lib/data/reports';
import { BOOKING_STATE_LABELS, SHOOT_TIER_LABELS, PALETTE, STATE_COLORS } from '@/lib/utils/constants';
import { formatCurrency } from '@/lib/utils/format';
import type { BookingState, ShootTier } from '@/lib/types/database';

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

  const cardStyle = { background: PALETTE.surface, borderColor: PALETTE.border };
  const subheadStyle = { color: PALETTE.muted };

  return (
    <>
      <Topbar title="Reports" />
      <div className="p-4 sm:p-6 space-y-6">

        {/* Summary KPIs */}
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-4">
          {[
            { label: 'Active Bookings', value: String(summary.totalActiveBookings), sub: null },
            { label: 'Revenue (This Month)', value: formatCurrency(summary.revenueThisMonth), sub: `Last mo: ${formatCurrency(summary.revenueLastMonth)}` },
            { label: 'Revenue (YTD)', value: formatCurrency(summary.revenueThisYear), sub: `All time: ${formatCurrency(summary.totalRevenueAllTime)}` },
            { label: 'Avg Booking Value', value: formatCurrency(summary.avgBookingValue), sub: null },
          ].map(({ label, value, sub }) => (
            <div key={label} className="rounded-lg border p-3" style={cardStyle}>
              <div className="text-[10px] font-semibold uppercase tracking-wider mb-1" style={subheadStyle}>{label}</div>
              <div className="text-lg font-semibold" style={{ color: PALETTE.text }}>{value}</div>
              {sub && <div className="text-[10px] mt-0.5" style={subheadStyle}>{sub}</div>}
            </div>
          ))}
        </div>

        {/* Win rate */}
        <section className="rounded-lg border p-4" style={cardStyle}>
          <h3 className="text-xs font-semibold uppercase tracking-wide mb-3" style={subheadStyle}>Quote Conversion</h3>
          <div className="flex flex-wrap gap-6">
            <div>
              <div className="text-[10px] uppercase tracking-wider mb-1" style={subheadStyle}>Win Rate</div>
              <div className="text-2xl font-semibold" style={{ color: winRate.winRate >= 0.5 ? PALETTE.success : PALETTE.warning }}>
                {winRate.winRate > 0 ? `${Math.round(winRate.winRate * 100)}%` : '—'}
              </div>
              <div className="text-[10px] mt-0.5" style={subheadStyle}>
                of decided quotes
              </div>
            </div>
            <div className="flex gap-6">
              {[
                { label: 'Quotes Sent', value: winRate.sent, color: PALETTE.text },
                { label: 'Confirmed', value: winRate.confirmed, color: PALETTE.success },
                { label: 'Lost', value: winRate.lost, color: PALETTE.danger },
              ].map(({ label, value, color }) => (
                <div key={label}>
                  <div className="text-[10px] uppercase tracking-wider mb-1" style={subheadStyle}>{label}</div>
                  <div className="text-2xl font-semibold" style={{ color }}>{value}</div>
                </div>
              ))}
            </div>
            {winRate.confirmed + winRate.lost > 0 && (
              <div className="flex-1 flex items-center min-w-32">
                <div className="w-full h-3 rounded overflow-hidden flex" style={{ background: `${PALETTE.danger}20` }}>
                  <div
                    className="h-full rounded-l"
                    style={{
                      width: `${Math.round(winRate.winRate * 100)}%`,
                      background: PALETTE.success,
                    }}
                  />
                </div>
              </div>
            )}
          </div>
        </section>

        {/* Monthly revenue bar chart */}
        <section className="rounded-lg border p-4" style={cardStyle}>
          <h3 className="text-xs font-semibold uppercase tracking-wide mb-4" style={subheadStyle}>
            Revenue — Last 12 Months
          </h3>
          {monthly.length === 0 ? (
            <p className="text-xs" style={subheadStyle}>No bookings in this period.</p>
          ) : (
            <div className="space-y-2">
              {monthly.map((m) => {
                const [yr, mo] = m.month.split('-');
                const monthLabel = new Date(`${yr}-${mo}-01`).toLocaleDateString('en-AU', { month: 'short', year: '2-digit' });
                const barPct = maxMonthlyRevenue > 0 ? (m.grandTotal / maxMonthlyRevenue) * 100 : 0;
                return (
                  <div key={m.month} className="flex items-center gap-3">
                    <div className="text-[11px] w-12 text-right flex-shrink-0" style={subheadStyle}>{monthLabel}</div>
                    <div className="flex-1 h-5 rounded overflow-hidden" style={{ background: `${PALETTE.accent}15` }}>
                      <div
                        className="h-full rounded transition-all"
                        style={{ width: `${barPct}%`, background: PALETTE.accent, minWidth: m.grandTotal > 0 ? 2 : 0 }}
                      />
                    </div>
                    <div className="text-xs w-24 flex-shrink-0" style={{ color: PALETTE.text }}>
                      {m.grandTotal > 0 ? formatCurrency(m.grandTotal) : '—'}
                      <span className="text-[10px] ml-1" style={subheadStyle}>({m.bookingCount})</span>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </section>

        <div className="grid gap-4 lg:grid-cols-2">
          {/* State breakdown */}
          <section className="rounded-lg border p-4" style={cardStyle}>
            <h3 className="text-xs font-semibold uppercase tracking-wide mb-4" style={subheadStyle}>
              Bookings by State
            </h3>
            {stateBreakdown.length === 0 ? (
              <p className="text-xs" style={subheadStyle}>No bookings yet.</p>
            ) : (
              <div className="space-y-2">
                {stateBreakdown.map(({ state, count }) => {
                  const total = stateBreakdown.reduce((s, r) => s + r.count, 0);
                  const pct = total > 0 ? (count / total) * 100 : 0;
                  const color = STATE_COLORS[state as BookingState] ?? PALETTE.muted;
                  return (
                    <div key={state} className="flex items-center gap-3">
                      <div className="text-[11px] flex-1" style={{ color: PALETTE.text }}>
                        {BOOKING_STATE_LABELS[state as BookingState] ?? state}
                      </div>
                      <div className="w-24 h-3 rounded overflow-hidden" style={{ background: `${color}20` }}>
                        <div className="h-full rounded" style={{ width: `${pct}%`, background: color }} />
                      </div>
                      <div className="text-[11px] w-6 text-right" style={subheadStyle}>{count}</div>
                    </div>
                  );
                })}
              </div>
            )}
          </section>

          {/* Tier breakdown */}
          <section className="rounded-lg border p-4" style={cardStyle}>
            <h3 className="text-xs font-semibold uppercase tracking-wide mb-4" style={subheadStyle}>
              Revenue by Tier
            </h3>
            {tierBreakdown.length === 0 ? (
              <p className="text-xs" style={subheadStyle}>No data yet.</p>
            ) : (
              <div className="space-y-2.5">
                {tierBreakdown.map(({ tier, count, grandTotal }) => {
                  const barPct = maxTierRevenue > 0 ? (grandTotal / maxTierRevenue) * 100 : 0;
                  return (
                    <div key={tier}>
                      <div className="flex justify-between text-[11px] mb-1">
                        <span style={{ color: PALETTE.text }}>{SHOOT_TIER_LABELS[tier as ShootTier] ?? tier}</span>
                        <span style={subheadStyle}>{count} booking{count !== 1 ? 's' : ''} · {grandTotal > 0 ? formatCurrency(grandTotal) : '—'}</span>
                      </div>
                      <div className="h-2 rounded overflow-hidden" style={{ background: `${PALETTE.success}15` }}>
                        <div className="h-full rounded" style={{ width: `${barPct}%`, background: PALETTE.success }} />
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </section>
        </div>

        <div className="grid gap-4 lg:grid-cols-2">
          {/* Top clients */}
          <section className="rounded-lg border p-4" style={cardStyle}>
            <h3 className="text-xs font-semibold uppercase tracking-wide mb-4" style={subheadStyle}>
              Top Clients by Revenue
            </h3>
            {topClients.length === 0 ? (
              <p className="text-xs" style={subheadStyle}>No client data yet.</p>
            ) : (
              <div className="space-y-2">
                {topClients.map(({ clientId, clientName, bookingCount, grandTotal }, i) => {
                  const barPct = maxClientRevenue > 0 ? (grandTotal / maxClientRevenue) * 100 : 0;
                  return (
                    <div key={clientId} className="flex items-center gap-3">
                      <div className="text-[10px] w-4 text-right flex-shrink-0" style={subheadStyle}>#{i + 1}</div>
                      <Link
                        href={`/clients/${clientId}`}
                        className="text-xs font-medium flex-1 hover:underline"
                        style={{ color: PALETTE.text }}
                      >
                        {clientName}
                      </Link>
                      <div className="w-24 h-3 rounded overflow-hidden flex-shrink-0" style={{ background: `${PALETTE.accent}15` }}>
                        <div className="h-full rounded" style={{ width: `${barPct}%`, background: PALETTE.accent }} />
                      </div>
                      <div className="text-xs flex-shrink-0 text-right" style={{ color: PALETTE.text, minWidth: 72 }}>
                        {grandTotal > 0 ? formatCurrency(grandTotal) : '—'}
                      </div>
                      <div className="text-[10px] flex-shrink-0 w-14 text-right" style={subheadStyle}>
                        ×{bookingCount}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </section>

          {/* Top talent */}
          <section className="rounded-lg border p-4" style={cardStyle}>
            <h3 className="text-xs font-semibold uppercase tracking-wide mb-4" style={subheadStyle}>
              Top Artists by Bookings
            </h3>
            {topTalent.length === 0 ? (
              <p className="text-xs" style={subheadStyle}>No artist data yet.</p>
            ) : (
              <div className="space-y-2">
                {topTalent.map(({ talentId, name, discipline, bookingCount }, i) => {
                  const barPct = maxTalentBookings > 0 ? (bookingCount / maxTalentBookings) * 100 : 0;
                  return (
                    <div key={talentId} className="flex items-center gap-3">
                      <div className="text-[10px] w-4 text-right flex-shrink-0" style={subheadStyle}>#{i + 1}</div>
                      <Link
                        href={`/talent/${talentId}`}
                        className="text-xs font-medium hover:underline"
                        style={{ color: PALETTE.text, minWidth: 80 }}
                      >
                        {name}
                      </Link>
                      {discipline && (
                        <div className="text-[10px] flex-shrink-0" style={subheadStyle}>
                          {discipline}
                        </div>
                      )}
                      <div className="flex-1 h-3 rounded overflow-hidden" style={{ background: `${PALETTE.accent}15` }}>
                        <div className="h-full rounded" style={{ width: `${barPct}%`, background: PALETTE.accent }} />
                      </div>
                      <div className="text-[10px] flex-shrink-0 w-8 text-right" style={{ color: PALETTE.text }}>
                        ×{bookingCount}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </section>
        </div>

      </div>
    </>
  );
}
