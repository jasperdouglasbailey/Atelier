import Link from 'next/link';
import Topbar from '@/components/layout/Topbar';
import { getBookingCounts, getUpcomingShoots, getAttentionItems } from '@/lib/data/bookings';
import { getPendingCount } from '@/lib/data/approvals';
import { listEvents } from '@/lib/utils/events';
import { describeEvent } from '@/lib/utils/event-descriptions';
import { getReportSummary } from '@/lib/data/reports';
import {
  BOOKING_STATE_LABELS, STATE_COLORS, SHOOT_TIER_LABELS,
  PALETTE, ACTIVE_STATES,
} from '@/lib/utils/constants';
import { formatDate, formatDateTime, formatCurrency } from '@/lib/utils/format';
import type { BookingState } from '@/lib/types/database';

// Labels + CTAs for each attention state
const ATTENTION_CONFIG: Record<string, { action: string; urgency: 'high' | 'medium' | 'low' }> = {
  morning_after_check: { action: 'Check selects & OT', urgency: 'high' },
  brief_received:      { action: 'Parse brief',         urgency: 'medium' },
  brief_parsed:        { action: 'Draft quote',          urgency: 'medium' },
  quote_drafted:       { action: 'Send to client',       urgency: 'medium' },
};

const urgencyColor: Record<string, string> = {
  high: PALETTE.danger,
  medium: PALETTE.warning,
  low: PALETTE.muted,
};

export default async function DashboardPage() {
  const [counts, upcoming, pendingApprovals, recentEvents, attentionItems, summary] = await Promise.all([
    getBookingCounts(),
    getUpcomingShoots(14),
    getPendingCount(),
    listEvents({ limit: 10 }),
    getAttentionItems(),
    getReportSummary(),
  ]);

  const totalActive = ACTIVE_STATES.reduce((s, st) => s + (counts[st] ?? 0), 0);

  // Pipeline — only show states with bookings
  const pipeline = ACTIVE_STATES
    .filter((st) => (counts[st] ?? 0) > 0)
    .map((st) => ({ state: st, count: counts[st] ?? 0 }));

  return (
    <>
      <Topbar title="Dashboard" />
      <div className="p-4 sm:p-6 space-y-6">
        {/* Summary KPI cards */}
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <StatCard label="Active Bookings" value={totalActive} href="/bookings" />
          <StatCard
            label="Revenue (Month)"
            value={formatCurrency(summary.revenueThisMonth)}
            href="/reports"
            accent
          />
          <StatCard
            label="Inbox"
            value={pendingApprovals}
            href="/inbox"
            accentIfPositive={pendingApprovals > 0}
          />
          <StatCard
            label="Revenue (YTD)"
            value={formatCurrency(summary.revenueThisYear)}
            href="/reports"
          />
        </div>

        {/* Morning decision queue */}
        {attentionItems.length > 0 && (
          <section className="rounded-lg border p-4" style={{ background: PALETTE.surface, borderColor: PALETTE.border }}>
            <h2 className="mb-3 text-xs font-semibold uppercase tracking-wide" style={{ color: PALETTE.muted }}>
              Needs Your Decision ({attentionItems.length})
            </h2>
            <div className="space-y-2">
              {attentionItems.map((item) => {
                const cfg = ATTENTION_CONFIG[item.state] ?? { action: 'Review', urgency: 'low' };
                const color = urgencyColor[cfg.urgency];
                const clientLabel = item.client_company || item.client_name || null;
                return (
                  <Link
                    key={item.id}
                    href={`/bookings/${item.id}`}
                    className="flex items-center justify-between rounded-md border px-4 py-3 transition hover:border-opacity-80"
                    style={{ borderColor: `${color}44`, background: `${color}08` }}
                  >
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-medium truncate" style={{ color: PALETTE.text }}>
                          {item.title}
                        </span>
                        {item.booking_ref && (
                          <span className="font-mono text-[10px] flex-shrink-0" style={{ color: PALETTE.accent }}>
                            {item.booking_ref}
                          </span>
                        )}
                      </div>
                      {clientLabel && (
                        <div className="text-[11px] mt-0.5" style={{ color: PALETTE.muted }}>{clientLabel}</div>
                      )}
                    </div>
                    <div className="flex-shrink-0 flex items-center gap-3 ml-4">
                      <span className="text-[11px] font-medium" style={{ color }}>
                        {cfg.action}
                      </span>
                      <span
                        className="rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase"
                        style={{ background: `${STATE_COLORS[item.state]}22`, color: STATE_COLORS[item.state] }}
                      >
                        {BOOKING_STATE_LABELS[item.state]}
                      </span>
                    </div>
                  </Link>
                );
              })}
            </div>
          </section>
        )}

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
                  const { label, detail } = describeEvent(e.event_type, payload);
                  const ref = payload.booking_ref as string | undefined;
                  return (
                    <div key={e.id} className="border-l-2 pl-3" style={{ borderColor: PALETTE.border }}>
                      <div className="flex items-baseline gap-2">
                        <span className="text-xs font-medium" style={{ color: PALETTE.text }}>
                          {label}
                        </span>
                        {ref && (
                          <span className="font-mono text-[10px]" style={{ color: PALETTE.accent }}>
                            {ref}
                          </span>
                        )}
                      </div>
                      {detail && (
                        <div className="text-[11px]" style={{ color: PALETTE.muted }}>{detail}</div>
                      )}
                      <div className="text-[10px]" style={{ color: '#6b6b6b' }}>
                        {formatDateTime(e.created_at)}
                        {e.actor ? ` · ${e.actor}` : ''}
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

function StatCard({
  label, value, href, accent, accentIfPositive,
}: {
  label: string;
  value: string | number;
  href: string;
  accent?: boolean;
  accentIfPositive?: boolean;
}) {
  const isAccented = accent || accentIfPositive;
  return (
    <Link
      href={href}
      className="rounded-lg border p-4 transition-opacity hover:opacity-80"
      style={{ background: PALETTE.surface, borderColor: isAccented ? PALETTE.accent : PALETTE.border }}
    >
      <div className="text-xs uppercase tracking-wide" style={{ color: PALETTE.muted }}>{label}</div>
      <div className="mt-1 text-2xl font-semibold" style={{ color: isAccented ? PALETTE.accent : PALETTE.text }}>
        {value}
      </div>
    </Link>
  );
}
