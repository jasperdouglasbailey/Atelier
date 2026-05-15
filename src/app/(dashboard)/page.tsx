import Link from 'next/link';
import Topbar from '@/components/layout/Topbar';
import { getUpcomingShoots, getAttentionItems, getOverdueInvoices } from '@/lib/data/bookings';
import { getBookingsRoster } from '@/lib/data/booking-roster';
import { listApprovals } from '@/lib/data/approvals';
import { listEvents } from '@/lib/utils/events';
import { describeEvent } from '@/lib/utils/event-descriptions';
import { getTopTalent } from '@/lib/data/reports';
import { getCachedBookingCounts, getCachedReportSummary } from '@/lib/data/dashboard-cache';
import { runHealthProbes } from '@/lib/utils/health';
import { getCurrentAppUser } from '@/lib/data/app-users';
import { getKillSwitchState } from '@/lib/utils/kill-switch';
import {
  getMonthShootMarkers,
  getThisWeekRoster,
  getJobsNeedingCrew,
  getBookingsInRange,
  thisWeekRange,
} from '@/lib/data/dashboard';
import {
  BOOKING_STATE_LABELS, STATE_COLORS, SHOOT_TIER_LABELS,
  PALETTE, ACTIVE_STATES,
} from '@/lib/utils/constants';
import { formatDateTime, formatCurrency } from '@/lib/utils/format';
import { humanise } from '@/lib/utils/humanise';
import BookingHoverCard from '@/components/bookings/BookingHoverCard';
import GreetingHeader from '@/components/dashboard/GreetingHeader';
import MiniMonthCalendar from '@/components/dashboard/MiniMonthCalendar';
import ThisWeekStrip from '@/components/dashboard/ThisWeekStrip';
import FinanceSection from '@/components/dashboard/FinanceSection';
import InboxPreview from '@/components/dashboard/InboxPreview';
import SettingsSnapshot from '@/components/dashboard/SettingsSnapshot';
import SectionCard from '@/components/ui/SectionCard';

// ============================================================================
// Dashboard — redesigned session 14 to be a true overview snapshot:
//
//   1. Greeting (role-aware Hello/Welcome back)
//   2. Health banner (failure only)
//   3. Mini month calendar + Finance section (side by side)
//   4. This-week strip (talent / crew on hold / jobs needing crew)
//   5. Attention queue + Upcoming shoots + Inbox preview + Settings snapshot
//   6. Top artists + Pipeline breakdown
//   7. Recent activity (collapsed)
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
  // Server components are allowed to call Date.now() / new Date() since
  // they only render once per request — react-hooks/purity scoped to
  // client components only.
  const now = new Date();
  const year = now.getFullYear();
  const month = now.getMonth();
  const week = thisWeekRange(now);

  const [
    counts, upcoming, recentEvents, attentionItems, summary,
    overdueInvoices, healthProbes, topTalent,
    appUser, killSwitch,
    monthMarkers, weekBookings, jobsNeedingCrew, pendingApprovals,
  ] = await Promise.all([
    getCachedBookingCounts(),
    getUpcomingShoots(),
    listEvents({ limit: 10 }),
    getAttentionItems(),
    getCachedReportSummary(),
    getOverdueInvoices(),
    runHealthProbes(),
    getTopTalent(6),
    getCurrentAppUser(),
    getKillSwitchState(),
    getMonthShootMarkers(year, month),
    getBookingsInRange(week.start, week.end),
    getJobsNeedingCrew(),
    listApprovals('pending'),
  ]);

  const weekBookingIds = weekBookings.map((b) => b.id);
  const [weekRoster, upcomingRoster] = await Promise.all([
    getThisWeekRoster(weekBookingIds),
    upcoming.length > 0 ? getBookingsRoster(upcoming.map((b) => b.id)) : Promise.resolve(new Map()),
  ]);

  const failedProbes = healthProbes.filter((p) => !p.ok);
  // eslint-disable-next-line react-hooks/purity
  const renderNow = Date.now();
  const totalActive = ACTIVE_STATES.reduce((s, st) => s + (counts[st] ?? 0), 0);

  const pipeline = ACTIVE_STATES
    .filter((st) => (counts[st] ?? 0) > 0)
    .map((st) => ({ state: st, count: counts[st] ?? 0 }));

  const URGENCY_WEIGHT = { high: 3, medium: 2, low: 1 } as const;
  const sortedAttentionItems = [...attentionItems].sort((a, b) => {
    const aW = URGENCY_WEIGHT[ATTENTION_CONFIG[a.state]?.urgency ?? 'low'];
    const bW = URGENCY_WEIGHT[ATTENTION_CONFIG[b.state]?.urgency ?? 'low'];
    return bW - aW;
  });

  const totalAttentionCount =
    overdueInvoices.length + attentionItems.length + (pendingApprovals.length > 0 ? 1 : 0);

  // Overdue total
  const overdueTotal = overdueInvoices.reduce((s, inv) => s + inv.grand_total, 0);

  // Resolve role for greeting — default to owner if no app_user (dev mode)
  const role = appUser?.role ?? 'owner';

  return (
    <>
      <Topbar title="Dashboard" />
      <div className="p-4 sm:p-6 space-y-4">

        {/* ── 1. GREETING ─────────────────────────────────────────── */}
        <GreetingHeader
          displayName={appUser?.display_name ?? null}
          role={role}
        />

        {/* ── 2. HEALTH BANNER (failure only) ─────────────────────── */}
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

        {/* ── 3. MINI CALENDAR + FINANCE ──────────────────────────── */}
        <div className="grid gap-4 lg:grid-cols-3">
          <div className="lg:col-span-1">
            <MiniMonthCalendar year={year} month={month} shootMarkers={monthMarkers} today={now} />
          </div>
          <div className="lg:col-span-2">
            <FinanceSection
              revenueThisWeek={summary.revenueThisWeek}
              revenueThisMonth={summary.revenueThisMonth}
              revenueLastMonth={summary.revenueLastMonth}
              revenueThisYear={summary.revenueThisYear}
              avgBookingValue={summary.avgBookingValue}
              overdueTotal={overdueTotal}
              overdueCount={overdueInvoices.length}
            />
          </div>
        </div>

        {/* ── 4. THIS WEEK — talent / crew on hold / jobs needing crew ── */}
        <ThisWeekStrip
          talent={weekRoster.talent}
          crewOnHold={weekRoster.crewOnHold}
          jobsNeedingCrew={jobsNeedingCrew}
        />

        {/* ── 5. ATTENTION + UPCOMING + INBOX/SETTINGS SIDEBAR ────── */}
        <div className="grid gap-4 lg:grid-cols-3">

          <div className="lg:col-span-2 space-y-4">

            {/* Needs attention */}
            {totalAttentionCount > 0 && (
              <SectionCard
                title="Needs attention"
                meta={`${totalAttentionCount} item${totalAttentionCount === 1 ? '' : 's'}`}
              >
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
                  {sortedAttentionItems.map((item) => {
                    const cfg = ATTENTION_CONFIG[item.state] ?? { action: 'Review', urgency: 'low' };
                    const color = urgencyColor[cfg.urgency];
                    const clientLabel = item.client_company || item.client_name || null;

                    // For morning_after_check: compute hours remaining in the OT window
                    let otWindowLabel: string | null = null;
                    if (item.state === 'morning_after_check' && item.ot_expenses_window_end && !item.ot_expenses_locked) {
                      const hoursLeft = Math.max(0, Math.round(
                        (new Date(item.ot_expenses_window_end).getTime() - renderNow) / 3_600_000
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

                  {/* Pending approvals — link is now redundant with InboxPreview but
                      kept here for users who scan top-to-bottom. */}
                  {pendingApprovals.length > 0 && (
                    <Link
                      href="/inbox"
                      className="flex items-center justify-between rounded-md border-l-2 px-4 py-3 transition hover:opacity-80"
                      style={{ borderColor: PALETTE.accent, background: `${PALETTE.accent}08` }}
                    >
                      <div>
                        <div className="text-sm font-medium" style={{ color: PALETTE.text }}>
                          {pendingApprovals.length} email{pendingApprovals.length === 1 ? '' : 's'} awaiting approval
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
              </SectionCard>
            )}

            {/* This week's shoots */}
            <SectionCard
              title="Upcoming shoots"
              meta={`${upcoming.length}`}
              action={{ label: 'Calendar', href: '/bookings?view=calendar' }}
            >
              {upcoming.length === 0 ? (
                <p className="text-xs" style={{ color: PALETTE.muted }}>No shoots scheduled.</p>
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
            </SectionCard>

            {/* Top artists + Pipeline — side-by-side underneath */}
            <div className="grid gap-4 sm:grid-cols-2">
              {topTalent.length > 0 && (
                <SectionCard
                  title="Top artists"
                  action={{ label: 'All', href: '/talent' }}
                >
                  <ul className="space-y-2">
                    {topTalent.slice(0, 5).map((t, i) => (
                      <li key={t.talentId}>
                        <Link
                          href={`/talent/${t.talentId}`}
                          className="flex items-start justify-between gap-2 transition hover:opacity-80"
                        >
                          <div className="min-w-0 flex-1">
                            <div className="flex items-center gap-1.5">
                              <span className="text-[10px] font-mono tabular-nums flex-none" style={{ color: PALETTE.muted, width: 14 }}>
                                {i + 1}
                              </span>
                              <span className="text-xs font-medium truncate" style={{ color: PALETTE.text }}>
                                {t.name}
                              </span>
                            </div>
                            {t.discipline && (
                              <div className="ml-5 text-[10px] truncate" style={{ color: PALETTE.accent }}>
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
                </SectionCard>
              )}

              {pipeline.length > 0 && (
                <SectionCard
                  title="Pipeline"
                  meta={`${totalActive} active`}
                  action={{ label: 'Bookings', href: '/bookings' }}
                >
                  <ul className="space-y-1">
                    {pipeline.map(({ state, count }) => (
                      <li key={state}>
                        <Link
                          href={`/bookings?state=${state}`}
                          className="flex items-center justify-between rounded-md px-2 py-1 transition hover:opacity-80"
                          style={{ background: `${STATE_COLORS[state]}10` }}
                        >
                          <span className="text-[11px]" style={{ color: PALETTE.muted }}>
                            {BOOKING_STATE_LABELS[state]}
                          </span>
                          <span
                            className="rounded-full px-2 py-0.5 text-[10px] font-semibold tabular-nums"
                            style={{ background: `${STATE_COLORS[state]}22`, color: STATE_COLORS[state] }}
                          >
                            {count}
                          </span>
                        </Link>
                      </li>
                    ))}
                  </ul>
                </SectionCard>
              )}
            </div>
          </div>

          {/* Right column — Inbox preview + Settings snapshot */}
          <div className="space-y-4">
            <InboxPreview approvals={pendingApprovals} />
            <SettingsSnapshot killSwitch={killSwitch} />
          </div>
        </div>

        {/* ── 6. RECENT ACTIVITY (collapsed) ──────────────────────── */}
        <details
          className="rounded-lg border"
          style={{ background: PALETTE.surface, borderColor: PALETTE.border }}
        >
          <summary
            className="cursor-pointer select-none px-4 py-2.5 text-[11px] font-semibold uppercase tracking-wider"
            style={{ color: PALETTE.muted }}
          >
            Recent activity ({recentEvents.length})
          </summary>
          <div className="px-4 pb-4">
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
