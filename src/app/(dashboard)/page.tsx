import Link from 'next/link';
import Topbar from '@/components/layout/Topbar';
import { getBookingCounts, getUpcomingShoots } from '@/lib/data/bookings';
import { getPendingCount } from '@/lib/data/approvals';
import { listEvents } from '@/lib/utils/events';
import { BOOKING_STATE_LABELS, STATE_COLORS, SHOOT_TIER_LABELS, PALETTE, ACTIVE_STATES } from '@/lib/utils/constants';
import { formatDate, formatDateTime } from '@/lib/utils/format';
import type { BookingState } from '@/lib/types/database';

export default async function DashboardPage() {
  const [counts, upcoming, pendingApprovals, recentEvents] = await Promise.all([
    getBookingCounts(),
    getUpcomingShoots(14),
    getPendingCount(),
    listEvents({ limit: 10 }),
  ]);

  const totalActive = ACTIVE_STATES.reduce((s, st) => s + (counts[st] ?? 0), 0);

  // Build pipeline summary — only show states with bookings
  const pipeline = ACTIVE_STATES
    .filter((st) => (counts[st] ?? 0) > 0)
    .map((st) => ({ state: st, count: counts[st] ?? 0 }));

  return (
    <>
      <Topbar title="Dashboard" />
      <div className="p-4 sm:p-6 space-y-6">
        {/* Summary cards */}
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <StatCard label="Active Bookings" value={totalActive} href="/bookings" />
          <StatCard label="Pending Approvals" value={pendingApprovals} href="/inbox" accent={pendingApprovals > 0} />
          <StatCard label="Completed" value={counts['paid'] ?? 0} href="/bookings?group=completed" />
          <StatCard label="Lost / Cancelled" value={(counts['released'] ?? 0) + (counts['cancelled'] ?? 0)} href="/bookings?group=lost" />
        </div>

        {/* Pipeline */}
        {pipeline.length > 0 && (
          <section className="rounded-lg border p-4" style={{ background: PALETTE.surface, borderColor: PALETTE.border }}>
            <h2 className="mb-3 text-xs font-semibold uppercase tracking-wide" style={{ color: PALETTE.muted }}>Pipeline</h2>
            <div className="flex flex-wrap gap-2">
              {pipeline.map(({ state, count }) => (
                <Link
                  key={state}
                  href={`/bookings?state=${state}`}
                  className="flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-medium transition-opacity hover:opacity-80"
                  style={{ background: `${STATE_COLORS[state]}22`, color: STATE_COLORS[state] }}
                >
                  <span className="text-sm font-bold">{count}</span>
                  {BOOKING_STATE_LABELS[state]}
                </Link>
              ))}
            </div>
          </section>
        )}

        <div className="grid gap-6 lg:grid-cols-2">
          {/* Upcoming shoots */}
          <section className="rounded-lg border p-4" style={{ background: PALETTE.surface, borderColor: PALETTE.border }}>
            <h2 className="mb-3 text-xs font-semibold uppercase tracking-wide" style={{ color: PALETTE.muted }}>
              Upcoming Shoots (14 days)
            </h2>
            {upcoming.length === 0 ? (
              <p className="text-xs" style={{ color: PALETTE.muted }}>No upcoming shoots.</p>
            ) : (
              <div className="space-y-2">
                {upcoming.map((b) => (
                  <Link
                    key={b.id}
                    href={`/bookings/${b.id}`}
                    className="flex items-center justify-between rounded-md px-3 py-2 transition-colors hover:opacity-80"
                    style={{ background: PALETTE.bg }}
                  >
                    <div>
                      <div className="text-sm font-medium" style={{ color: PALETTE.text }}>{b.title}</div>
                      <div className="text-[11px]" style={{ color: PALETTE.muted }}>
                        {b.booking_ref} · {SHOOT_TIER_LABELS[b.tier]}
                        {b.shoot_date_notes && ` · ${b.shoot_date_notes}`}
                      </div>
                    </div>
                    <span
                      className="rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase"
                      style={{ background: `${STATE_COLORS[b.state]}22`, color: STATE_COLORS[b.state] }}
                    >
                      {BOOKING_STATE_LABELS[b.state]}
                    </span>
                  </Link>
                ))}
              </div>
            )}
          </section>

          {/* Recent activity */}
          <section className="rounded-lg border p-4" style={{ background: PALETTE.surface, borderColor: PALETTE.border }}>
            <h2 className="mb-3 text-xs font-semibold uppercase tracking-wide" style={{ color: PALETTE.muted }}>
              Recent Activity
            </h2>
            {recentEvents.length === 0 ? (
              <p className="text-xs" style={{ color: PALETTE.muted }}>No activity yet.</p>
            ) : (
              <div className="space-y-2">
                {recentEvents.map((e) => {
                  const payload = (e.payload ?? {}) as Record<string, unknown>;
                  return (
                    <div key={e.id} className="border-l-2 pl-3" style={{ borderColor: PALETTE.border }}>
                      <div className="text-xs font-medium" style={{ color: PALETTE.text }}>
                        {e.event_type.replace(/\./g, ' · ')}
                      </div>
                      {payload.booking_ref ? (
                        <div className="text-[11px]" style={{ color: PALETTE.accent }}>
                          {String(payload.booking_ref)}
                        </div>
                      ) : null}
                      <div className="text-[10px]" style={{ color: '#6b7186' }}>
                        {formatDateTime(e.created_at)}
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

function StatCard({ label, value, href, accent }: { label: string; value: number; href: string; accent?: boolean }) {
  return (
    <Link
      href={href}
      className="rounded-lg border p-4 transition-opacity hover:opacity-80"
      style={{ background: PALETTE.surface, borderColor: accent ? PALETTE.accent : PALETTE.border }}
    >
      <div className="text-xs uppercase tracking-wide" style={{ color: PALETTE.muted }}>{label}</div>
      <div className="mt-1 text-2xl font-semibold" style={{ color: accent ? PALETTE.accent : PALETTE.text }}>
        {value}
      </div>
    </Link>
  );
}
