import Link from 'next/link';
import Topbar from '@/components/layout/Topbar';
import { getUpcomingShoots, getAttentionItems, getOverdueInvoices } from '@/lib/data/bookings';
import { getBookingsRoster } from '@/lib/data/booking-roster';
import { getPendingCount } from '@/lib/data/approvals';
import { listEvents } from '@/lib/utils/events';
import { describeEvent } from '@/lib/utils/event-descriptions';
import { getTopTalent } from '@/lib/data/reports';
import { getCachedBookingCounts, getCachedReportSummary } from '@/lib/data/dashboard-cache';
import { runHealthProbes } from '@/lib/utils/health';
import {
  BOOKING_STATE_LABELS, STATE_COLORS, SHOOT_TIER_LABELS,
  PALETTE, ACTIVE_STATES,
} from '@/lib/utils/constants';
import { formatDateTime, formatCurrency } from '@/lib/utils/format';
import { humanise } from '@/lib/utils/humanise';
import BookingHoverCard from '@/components/bookings/BookingHoverCard';

// ============================================================================
// Dashboard — redesigned session 9.
//
// Layout:
//   1. Health banner (failure only)
//   2. KPI row — 4 cards: active, this week $, this month $, YTD $
//   3. Two-column grid on lg screens:
//      LEFT (2/3): Needs attention now + This week's shoots
//      RIGHT (1/3): Top artists + Pipeline breakdown
//   4. Recent activity (collapsed — mostly automation noise)
// ============================================================================

const ATTENTION_CONFIG: Record<string, { action: string; urgency: 'high' | 'medium' | 'low' }> = {
  morning_after_check: { action: 'Check selects & OT', urgency: 'high' },
  brief_received:      { action: 'Parse brief',         urgency: 'medium' },
  brief_parsed:        { action: 'Draft quote',          urgency: 'medium' },
  quote_drafted:       { action: 'Send to client',       urgency: 'medium' },
};

const urgencyColor: Record<string, string> = {
  high:   PALETTE.danger,
  medium: PALETTE.warning,
  low:    PALETTE.muted,
};

export default async function DashboardPage() {
  const [counts, upcoming, pendingApprovals, recentEvents, attentionItems, summary, overdueInvoices, healthProbes, topTalent] = await Promise.all([
    getCachedBookingCounts(),
    getUpcomingShoots(7),
    getPendingCount(),
    listEvents({ limit: 10 }),
    getAttentionItems(),
    getCachedReportSummary(),
    getOverdueInvoices(),
    runHealthProbes(),
    getTopTalent(6),
  ]);

  const upcomingRoster = upcoming.length > 0
    ? await getBookingsRoster(upcoming.map((b) => b.id))
    : new Map();

  const failedProbes = healthProbes.filter((p) => !p.ok);
  const totalActive = ACTIVE_STATES.reduce((s, st) => s + (counts[st] ?? 0), 0);

  const pipeline = ACTIVE_STATES
    .filter((st) => (counts[st] ?? 0) > 0)
    .map((st) => ({ state: st, count: counts[st] ?? 0 }));

  const monthDelta = summary.revenueLastMonth > 0
    ? ((summary.revenueThisMonth - summary.revenueLastMonth) / summary.revenueLastMonth) * 100
    : null;

  const totalAttentionCount =
    overdueInvoices.length + attentionItems.length + (pendingApprovals > 0 ? 1 : 0);

  return (
    <>
      <Topbar title="Dashboard" />
      <div className="p-4 sm:p-6 space-y-6">

        {/* ── 1. HEALTH BANNER (failure only) ─────────────────────── */}
        {failedProbes.length > 0 && (
          <section
            className="rounded-lg border-l-2 px-4 py-3"
            style={{ background: `${PALETTE.danger}11`, borderColor: PALETTE.danger }}
          >
            <div className="flex items-center justify-between">
              <div>
                <div className="text-xs font-semibold uppercase tracking-wider" style={{ color: PALETTE.danger }}>
                  System health — {failedProbes.length} probe{failedProbes.length === 1 ? '' : 's'} failing
                </div>
                <div className="mt-1 text-[11px]" style={{ color: PALETTE.muted }}>
                  Usually a column rename, missing migration, or RLS regression.
                </div>
              </div>
              <Link href="/api/health?probe=1" className="text-[11px] underline" style={{ color: PALETTE.danger }}>
                Raw output →
              </Link>
            </div>
            <ul className="mt-2 space-y-0.5">
              {failedProbes.map((p) => (
                <li key={p.name} className="text-[11px] tabular-nums" style={{ color: PALETTE.text }}>
                  <span className="font-mono opacity-70">{p.name}:</span>{' '}
                  <span style={{ color: PALETTE.danger }}>{'error' in p ? p.error : ''}</span>
                </li>
              ))}
            </ul>
          </section>
        )}

        {/* ── 2. KPI ROW ──────────────────────────────────────────── */}
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          {/* Active bookings */}
          <Link
            href="/bookings"
            className="rounded-lg border p-4 transition hover:opacity-80"
            style={{ background: PALETTE.surface, borderColor: PALETTE.border }}
          >
            <div className="text-[10px] uppercase tracking-wider" style={{ color: PALETTE.muted }}>Active</div>
            <div className="mt-1 text-2xl font-semibold tabular-nums" style={{ color: PALETTE.text }}>{totalActive}</div>
            <div className="mt-1 text-[11px]" style={{ color: PALETTE.muted }}>bookings in progress</div>
          </Link>

          {/* This week revenue */}
          <Link
            href="/bookings?view=calendar"
            className="rounded-lg border p-4 transition hover:opacity-80"
            style={{ background: PALETTE.surface, borderColor: PALETTE.border }}
          >
            <div className="text-[10px] uppercase tracking-wider" style={{ color: PALETTE.muted }}>This week</div>
            <div className="mt-1 text-2xl font-semibold tabular-nums" style={{ color: PALETTE.text }}>
              {formatCurrency(summary.revenueThisWeek)}
            </div>
            <div className="mt-1 text-[11px]" style={{ color: PALETTE.muted }}>confirmed shoots</div>
          </Link>

          {/* This month */}
          <Link
            href="/reports"
            className="rounded-lg border p-4 transition hover:opacity-80"
            style={{ background: PALETTE.surface, borderColor: PALETTE.accent }}
          >
            <div className="text-[10px] uppercase tracking-wider" style={{ color: PALETTE.muted }}>This month</div>
            <div className="mt-1 text-2xl font-semibold tabular-nums" style={{ color: PALETTE.accent }}>
              {formatCurrency(summary.revenueThisMonth)}
            </div>
            <div className="mt-1 text-[11px]" style={{ color: PALETTE.muted }}>
              {monthDelta === null ? (
                'no prior month data'
              ) : (
                <span style={{ color: monthDelta >= 0 ? PALETTE.success : PALETTE.danger }}>
                  {monthDelta >= 0 ? '↑' : '↓'}{Math.abs(monthDelta).toFixed(0)}% vs last month
                </span>
              )}
            </div>
          </Link>

          {/* YTD */}
          <Link
            href="/reports"
            className="rounded-lg border p-4 transition hover:opacity-80"
            style={{ background: PALETTE.surface, borderColor: PALETTE.border }}
          >
            <div className="text-[10px] uppercase tracking-wider" style={{ color: PALETTE.muted }}>Year to date</div>
            <div className="mt-1 text-2xl font-semibold tabular-nums" style={{ color: PALETTE.text }}>
              {formatCurrency(summary.revenueThisYear)}
            </div>
            <div className="mt-1 text-[11px]" style={{ color: PALETTE.muted }}>
              avg {formatCurrency(summary.avgBookingValue)}/booking
            </div>
          </Link>
        </div>

        {/* ── 3. MAIN CONTENT GRID ────────────────────────────────── */}
        <div className="grid gap-6 lg:grid-cols-3">

          {/* LEFT COLUMN (2/3) — actionable + schedule */}
          <div className="lg:col-span-2 space-y-6">

            {/* Needs attention */}
            {totalAttentionCount > 0 && (
              <section
                className="rounded-lg border p-5"
                style={{ background: PALETTE.surface, borderColor: PALETTE.border }}
              >
                <div className="mb-4 flex items-baseline justify-between">
                  <h2 className="text-sm font-semibold" style={{ color: PALETTE.text }}>
                    Needs attention
                  </h2>
                  <span className="text-[11px]" style={{ color: PALETTE.muted }}>
                    {totalAttentionCount} item{totalAttentionCount === 1 ? '' : 's'}
                  </span>
                </div>
                <div className="space-y-2">
                  {/* Overdue invoices first */}
                  {overdueInvoices.map((inv) => {
                    const clientLabel = inv.client_company || inv.client_name;
                    return (
                      <Link
                        key={`overdue-${inv.id}`}
                        href={`/bookings/${inv.id}`}
                        className="flex items-center justify-between rounded-md border-l-2 px-4 py-3 transition hover:opacity-80"
                        style={{
                          borderColor: inv.is_overdue ? PALETTE.danger : PALETTE.warning,
                          background: inv.is_overdue ? `${PALETTE.danger}08` : `${PALETTE.warning}08`,
                        }}
                      >
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-2">
                            <span className="text-sm font-medium" style={{ color: PALETTE.text }}>{inv.title}</span>
                            {inv.booking_ref && (
                              <span className="font-mono text-[10px]" style={{ color: PALETTE.accent }}>{inv.booking_ref}</span>
                            )}
                          </div>
                          {clientLabel && <div className="text-[11px] mt-0.5" style={{ color: PALETTE.muted }}>{clientLabel}</div>}
                        </div>
                        <div className="text-right ml-4 flex-none">
                          <div className="text-sm font-semibold" style={{ color: PALETTE.text }}>
                            {formatCurrency(inv.grand_total)}
                          </div>
                          <div className="text-[11px] font-medium" style={{ color: inv.is_overdue ? PALETTE.danger : PALETTE.warning }}>
                            {inv.days_outstanding}d outstanding{inv.is_overdue ? ' — overdue' : ''}
                          </div>
                        </div>
                      </Link>
                    );
                  })}

                  {/* Attention items */}
                  {attentionItems.map((item) => {
                    const cfg = ATTENTION_CONFIG[item.state] ?? { action: 'Review', urgency: 'low' };
                    const color = urgencyColor[cfg.urgency];
                    const clientLabel = item.client_company || item.client_name || null;

                    // For morning_after_check: compute hours remaining in the OT window
                    let otWindowLabel: string | null = null;
                    if (item.state === 'morning_after_check' && item.ot_expenses_window_end && !item.ot_expenses_locked) {
                      const hoursLeft = Math.max(0, Math.round(
                        (new Date(item.ot_expenses_window_end).getTime() - Date.now()) / 3_600_000
                      ));
                      otWindowLabel = hoursLeft <= 0
                        ? 'OT window closing soon'
                        : `OT window closes in ${hoursLeft}h`;
                    }

                    return (
                      <Link
                        key={`att-${item.id}`}
                        href={`/bookings/${item.id}#morning-after`}
                        className="flex items-center justify-between rounded-md border-l-2 px-4 py-3 transition hover:opacity-80"
                        style={{ borderColor: color, background: `${color}08` }}
                      >
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-2">
                            <span className="text-sm font-medium" style={{ color: PALETTE.text }}>{item.title}</span>
                            {item.booking_ref && (
                              <span className="font-mono text-[10px]" style={{ color: PALETTE.accent }}>{item.booking_ref}</span>
                            )}
                          </div>
                          <div className="flex items-center gap-2 mt-0.5">
                            {clientLabel && <span className="text-[11px]" style={{ color: PALETTE.muted }}>{clientLabel}</span>}
                            {otWindowLabel && (
                              <span className="text-[11px] font-semibold" style={{ color: PALETTE.danger }}>{otWindowLabel}</span>
                            )}
                          </div>
                        </div>
                        <div className="ml-4 flex-none flex items-center gap-3">
                          <span className="text-[11px] font-medium" style={{ color }}>{cfg.action} →</span>
                        </div>
                      </Link>
                    );
                  })}

                  {/* Pending approvals */}
                  {pendingApprovals > 0 && (
                    <Link
                      href="/inbox"
                      className="flex items-center justify-between rounded-md border-l-2 px-4 py-3 transition hover:opacity-80"
                      style={{ borderColor: PALETTE.accent, background: `${PALETTE.accent}08` }}
                    >
                      <div>
                        <div className="text-sm font-medium" style={{ color: PALETTE.text }}>
                          {pendingApprovals} email{pendingApprovals === 1 ? '' : 's'} awaiting approval
                        </div>
                        <div className="text-[11px] mt-0.5" style={{ color: PALETTE.muted }}>
                          Quote chases, compliance reminders, gallery requests
                        </div>
                      </div>
                      <span className="text-[11px] font-medium flex-none ml-4" style={{ color: PALETTE.accent }}>
                        Review →
                      </span>
                    </Link>
                  )}
                </div>
              </section>
            )}

            {/* This week's shoots */}
            <section
              className="rounded-lg border p-5"
              style={{ background: PALETTE.surface, borderColor: PALETTE.border }}
            >
              <div className="mb-4 flex items-baseline justify-between">
                <h2 className="text-sm font-semibold" style={{ color: PALETTE.text }}>
                  This week
                </h2>
                <Link href="/bookings?view=calendar" className="text-[11px]" style={{ color: PALETTE.accent }}>
                  Calendar →
                </Link>
              </div>

              {upcoming.length === 0 ? (
                <p className="text-xs" style={{ color: PALETTE.muted }}>No shoots scheduled this week.</p>
              ) : (
                <div className="space-y-2">
                  {upcoming.map((b) => {
                    const clientLabel = (b as { client_company?: string | null; client_name?: string | null }).client_company
                      || (b as { client_company?: string | null; client_name?: string | null }).client_name
                      || null;
                    const roster = upcomingRoster.get(b.id) ?? null;
                    const primaryArtist = roster?.talent[0]?.name ?? null;

                    return (
                      <BookingHoverCard
                        key={b.id}
                        bookingRef={b.booking_ref}
                        title={b.title}
                        state={b.state}
                        shootDates={b.shoot_date_notes}
                        shootLocation={b.shoot_location}
                        clientName={clientLabel}
                        roster={roster}
                      >
                        <Link
                          href={`/bookings/${b.id}`}
                          className="flex items-center justify-between rounded-md px-3 py-2.5 transition hover:opacity-80"
                          style={{ background: PALETTE.bg, display: 'flex' }}
                        >
                          <div className="min-w-0">
                            {primaryArtist && (
                              <div className="text-sm font-semibold" style={{ color: PALETTE.text }}>
                                {primaryArtist}
                                {roster && roster.talent.length > 1 && (
                                  <span className="ml-1 text-[11px] font-normal" style={{ color: PALETTE.muted }}>
                                    + {roster.talent.length - 1} more
                                  </span>
                                )}
                              </div>
                            )}
                            <div className="text-xs" style={{ color: primaryArtist ? PALETTE.muted : PALETTE.text }}>
                              {b.booking_ref} · {b.title}
                              {clientLabel && ` · ${clientLabel}`}
                            </div>
                            <div className="mt-0.5 text-[11px]" style={{ color: PALETTE.muted }}>
                              {SHOOT_TIER_LABELS[b.tier]}
                              {b.shoot_date_notes && ` · ${b.shoot_date_notes}`}
                              {roster && roster.crew.length > 0 && ` · ${roster.crew.length} crew`}
                            </div>
                          </div>
                          <span
                            className="ml-3 flex-none rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase"
                            style={{ background: `${STATE_COLORS[b.state]}22`, color: STATE_COLORS[b.state] }}
                          >
                            {BOOKING_STATE_LABELS[b.state]}
                          </span>
                        </Link>
                      </BookingHoverCard>
                    );
                  })}
                </div>
              )}
            </section>
          </div>

          {/* RIGHT COLUMN (1/3) — context + rankings */}
          <div className="space-y-6">

            {/* Top artists — compact list */}
            {topTalent.length > 0 && (
              <section
                className="rounded-lg border p-4"
                style={{ background: PALETTE.surface, borderColor: PALETTE.border }}
              >
                <div className="mb-3 flex items-baseline justify-between">
                  <h2 className="text-xs font-semibold uppercase tracking-wide" style={{ color: PALETTE.muted }}>
                    Top artists
                  </h2>
                  <Link href="/talent" className="text-[11px]" style={{ color: PALETTE.accent }}>
                    All →
                  </Link>
                </div>
                <ul className="space-y-3">
                  {topTalent.map((t, i) => (
                    <li key={t.talentId}>
                      <Link
                        href={`/talent/${t.talentId}`}
                        className="flex items-start justify-between gap-2 transition hover:opacity-80"
                      >
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-1.5">
                            <span
                              className="text-[10px] font-mono tabular-nums flex-none"
                              style={{ color: PALETTE.muted, width: 14 }}
                            >
                              {i + 1}
                            </span>
                            <span className="text-sm font-medium truncate" style={{ color: PALETTE.text }}>
                              {t.name}
                            </span>
                          </div>
                          {t.discipline && (
                            <div className="ml-5 text-[11px] truncate" style={{ color: PALETTE.accent }}>
                              {humanise(t.discipline)}
                            </div>
                          )}
                        </div>
                        <div className="flex-none text-right">
                          <div className="text-xs font-semibold tabular-nums" style={{ color: PALETTE.text }}>
                            {formatCurrency(t.totalRevenue)}
                          </div>
                          <div className="text-[10px]" style={{ color: PALETTE.muted }}>
                            {t.bookingCount} booking{t.bookingCount === 1 ? '' : 's'}
                          </div>
                        </div>
                      </Link>
                    </li>
                  ))}
                </ul>
              </section>
            )}

            {/* Pipeline breakdown */}
            {pipeline.length > 0 && (
              <section
                className="rounded-lg border p-4"
                style={{ background: PALETTE.surface, borderColor: PALETTE.border }}
              >
                <div className="mb-3 flex items-baseline justify-between">
                  <h2 className="text-xs font-semibold uppercase tracking-wide" style={{ color: PALETTE.muted }}>
                    Pipeline
                  </h2>
                  <Link href="/bookings" className="text-[11px]" style={{ color: PALETTE.accent }}>
                    All →
                  </Link>
                </div>
                <ul className="space-y-2">
                  {pipeline.map(({ state, count }) => (
                    <li key={state}>
                      <Link
                        href={`/bookings?state=${state}`}
                        className="flex items-center justify-between rounded-md px-2 py-1.5 transition hover:opacity-80"
                        style={{ background: `${STATE_COLORS[state]}10` }}
                      >
                        <span className="text-xs" style={{ color: PALETTE.muted }}>
                          {BOOKING_STATE_LABELS[state]}
                        </span>
                        <span
                          className="rounded-full px-2 py-0.5 text-[11px] font-semibold tabular-nums"
                          style={{ background: `${STATE_COLORS[state]}22`, color: STATE_COLORS[state] }}
                        >
                          {count}
                        </span>
                      </Link>
                    </li>
                  ))}
                </ul>
              </section>
            )}
          </div>
        </div>

        {/* ── 4. RECENT ACTIVITY (collapsed) ──────────────────────── */}
        <details
          className="rounded-lg border"
          style={{ background: PALETTE.surface, borderColor: PALETTE.border }}
        >
          <summary
            className="cursor-pointer select-none px-5 py-3 text-xs font-semibold uppercase tracking-wide"
            style={{ color: PALETTE.muted }}
          >
            Recent activity ({recentEvents.length})
          </summary>
          <div className="px-5 pb-5">
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
                        <span className="text-xs font-medium" style={{ color: PALETTE.text }}>{label}</span>
                        {ref && <span className="font-mono text-[10px]" style={{ color: PALETTE.accent }}>{ref}</span>}
                      </div>
                      {detail && <div className="text-[11px]" style={{ color: PALETTE.muted }}>{detail}</div>}
                      <div className="text-[10px]" style={{ color: '#6b6b6b' }}>
                        {formatDateTime(e.created_at)}{e.actor ? ` · ${e.actor}` : ''}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </details>

      </div>
    </>
  );
}
