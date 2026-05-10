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
// Dashboard — artist-first redesign per session 8 doctrine.
//
// Reading order top → bottom:
//   1. Health banner (only on failure)
//   2. "Needs attention now" — single prioritised list of every actionable
//      thing across overdue invoices, decisions, and approvals
//   3. "This week" — upcoming shoots with full team roster + copy buttons,
//      so producers see exactly who's working when
//   4. "Pipeline at a glance" — three KPI cards (bookings / MTD / YTD)
//   5. "Top artists" — horizontal strip of most-booked talent (artist-first)
//   6. Recent activity — collapsed by default (mostly automation noise)
// ============================================================================

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
  const [counts, upcoming, pendingApprovals, recentEvents, attentionItems, summary, overdueInvoices, healthProbes, topTalent] = await Promise.all([
    getCachedBookingCounts(),
    getUpcomingShoots(7),
    getPendingCount(),
    listEvents({ limit: 10 }),
    getAttentionItems(),
    getCachedReportSummary(),
    getOverdueInvoices(),
    runHealthProbes(),
    getTopTalent(8),
  ]);

  // Roster for the upcoming shoots panel — one batched query so each
  // shoot row can hover-show its full team without N+1.
  const upcomingRoster = upcoming.length > 0
    ? await getBookingsRoster(upcoming.map((b) => b.id))
    : new Map();

  const failedProbes = healthProbes.filter((p) => !p.ok);
  const totalActive = ACTIVE_STATES.reduce((s, st) => s + (counts[st] ?? 0), 0);

  // Pipeline breakdown — only states with at least one booking
  const pipeline = ACTIVE_STATES
    .filter((st) => (counts[st] ?? 0) > 0)
    .map((st) => ({ state: st, count: counts[st] ?? 0 }));

  // Revenue delta — month-over-month
  const monthDelta = summary.revenueLastMonth > 0
    ? ((summary.revenueThisMonth - summary.revenueLastMonth) / summary.revenueLastMonth) * 100
    : null;

  return (
    <>
      <Topbar title="Dashboard" />
      <div className="p-4 sm:p-6 space-y-6">
        {/* ===== 1. HEALTH BANNER ===== */}
        {failedProbes.length > 0 && (
          <section
            className="rounded-lg border-l-2 px-4 py-3"
            style={{ background: `${PALETTE.danger}11`, borderColor: PALETTE.danger }}
          >
            <div className="flex items-center justify-between">
              <div>
                <div className="text-xs font-semibold uppercase tracking-wider" style={{ color: PALETTE.danger }}>
                  System health — {failedProbes.length} query failing
                </div>
                <div className="mt-1 text-[11px]" style={{ color: PALETTE.muted }}>
                  These run on every dashboard load. A failure usually means a column
                  rename, missing migration, or RLS regression.
                </div>
              </div>
              <Link
                href="/api/health?probe=1"
                className="text-[11px] underline"
                style={{ color: PALETTE.danger }}
              >
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

        {/* ===== 2. NEEDS ATTENTION NOW =====
            Combined priority list of overdue invoices, attention items, and
            pending approvals. The single most actionable section on the page. */}
        {(overdueInvoices.length > 0 || attentionItems.length > 0 || pendingApprovals > 0) && (
          <section className="rounded-lg border p-5" style={{ background: PALETTE.surface, borderColor: PALETTE.border }}>
            <div className="mb-4 flex items-baseline justify-between">
              <h2 className="text-sm font-semibold" style={{ color: PALETTE.text }}>
                Needs attention now
              </h2>
              <span className="text-[11px]" style={{ color: PALETTE.muted }}>
                {overdueInvoices.length + attentionItems.length + (pendingApprovals > 0 ? 1 : 0)} item{overdueInvoices.length + attentionItems.length + (pendingApprovals > 0 ? 1 : 0) === 1 ? '' : 's'}
              </span>
            </div>

            <div className="space-y-2">
              {/* Overdue invoices first — money on the line */}
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
                    <div className="text-right ml-4">
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

              {/* Attention items — bookings stuck waiting for an action */}
              {attentionItems.map((item) => {
                const cfg = ATTENTION_CONFIG[item.state] ?? { action: 'Review', urgency: 'low' };
                const color = urgencyColor[cfg.urgency];
                const clientLabel = item.client_company || item.client_name || null;
                return (
                  <Link
                    key={`att-${item.id}`}
                    href={`/bookings/${item.id}`}
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
                      {clientLabel && <div className="text-[11px] mt-0.5" style={{ color: PALETTE.muted }}>{clientLabel}</div>}
                    </div>
                    <div className="ml-4 flex items-center gap-3">
                      <span className="text-[11px] font-medium" style={{ color }}>{cfg.action}</span>
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

              {/* Approvals queue — single row pointing to /inbox if there are any */}
              {pendingApprovals > 0 && (
                <Link
                  href="/inbox"
                  className="flex items-center justify-between rounded-md border-l-2 px-4 py-3 transition hover:opacity-80"
                  style={{ borderColor: PALETTE.accent, background: `${PALETTE.accent}08` }}
                >
                  <div>
                    <div className="text-sm font-medium" style={{ color: PALETTE.text }}>
                      {pendingApprovals} email{pendingApprovals === 1 ? '' : 's'} waiting for approval
                    </div>
                    <div className="text-[11px] mt-0.5" style={{ color: PALETTE.muted }}>
                      Quote chases, compliance reminders, gallery requests
                    </div>
                  </div>
                  <span className="text-[11px] font-medium" style={{ color: PALETTE.accent }}>Review →</span>
                </Link>
              )}
            </div>
          </section>
        )}

        {/* ===== 3. THIS WEEK ===== */}
        <section className="rounded-lg border p-5" style={{ background: PALETTE.surface, borderColor: PALETTE.border }}>
          <div className="mb-4 flex items-baseline justify-between">
            <h2 className="text-sm font-semibold" style={{ color: PALETTE.text }}>
              This week
            </h2>
            <span className="text-[11px]" style={{ color: PALETTE.muted }}>
              {upcoming.length} shoot{upcoming.length === 1 ? '' : 's'} in the next 7 days
            </span>
          </div>

          {upcoming.length === 0 ? (
            <p className="text-xs" style={{ color: PALETTE.muted }}>No shoots scheduled. Time to chase quotes.</p>
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
                        <div className="text-[11px] mt-0.5" style={{ color: PALETTE.muted }}>
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

          <p className="mt-3 text-[10px]" style={{ color: PALETTE.muted }}>
            Hover any shoot for the full team list and copy buttons.
          </p>
        </section>

        {/* ===== 4. PIPELINE AT A GLANCE ===== */}
        <section>
          <div className="mb-3 flex items-baseline justify-between">
            <h2 className="text-sm font-semibold" style={{ color: PALETTE.text }}>
              Pipeline at a glance
            </h2>
          </div>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {/* Active bookings + state breakdown */}
            <Link
              href="/bookings"
              className="rounded-lg border p-4 transition hover:opacity-80"
              style={{ background: PALETTE.surface, borderColor: PALETTE.border }}
            >
              <div className="text-[10px] uppercase tracking-wider" style={{ color: PALETTE.muted }}>Active bookings</div>
              <div className="mt-1 text-2xl font-semibold" style={{ color: PALETTE.text }}>{totalActive}</div>
              <div className="mt-2 flex flex-wrap gap-1">
                {pipeline.slice(0, 4).map(({ state, count }) => (
                  <span
                    key={state}
                    className="inline-flex items-center gap-1 rounded-full px-1.5 py-0.5 text-[9px] font-medium"
                    style={{ background: `${STATE_COLORS[state]}22`, color: STATE_COLORS[state] }}
                  >
                    {count} {BOOKING_STATE_LABELS[state]}
                  </span>
                ))}
                {pipeline.length > 4 && (
                  <span className="text-[10px]" style={{ color: PALETTE.muted }}>+{pipeline.length - 4} more</span>
                )}
              </div>
            </Link>

            {/* Revenue this week — confirmed shoots intersecting Mon-Sun */}
            <Link
              href="/bookings?view=calendar"
              className="rounded-lg border p-4 transition hover:opacity-80"
              style={{ background: PALETTE.surface, borderColor: PALETTE.border }}
            >
              <div className="text-[10px] uppercase tracking-wider" style={{ color: PALETTE.muted }}>Revenue this week</div>
              <div className="mt-1 text-2xl font-semibold" style={{ color: PALETTE.text }}>
                {formatCurrency(summary.revenueThisWeek)}
              </div>
              <div className="mt-2 text-[11px]" style={{ color: PALETTE.muted }}>
                Confirmed shoots Mon–Sun
              </div>
            </Link>

            {/* Revenue MTD with month-over-month delta */}
            <Link
              href="/reports"
              className="rounded-lg border p-4 transition hover:opacity-80"
              style={{ background: PALETTE.surface, borderColor: PALETTE.accent }}
            >
              <div className="text-[10px] uppercase tracking-wider" style={{ color: PALETTE.muted }}>Revenue this month</div>
              <div className="mt-1 text-2xl font-semibold" style={{ color: PALETTE.accent }}>
                {formatCurrency(summary.revenueThisMonth)}
              </div>
              <div className="mt-2 text-[11px]" style={{ color: PALETTE.muted }}>
                {monthDelta === null ? (
                  <span>No comparison — last month was zero</span>
                ) : (
                  <>
                    <span style={{ color: monthDelta >= 0 ? PALETTE.success : PALETTE.danger }}>
                      {monthDelta >= 0 ? '↑' : '↓'} {Math.abs(monthDelta).toFixed(0)}%
                    </span>
                    {' vs '}{formatCurrency(summary.revenueLastMonth)} last month
                  </>
                )}
              </div>
            </Link>

            {/* YTD revenue */}
            <Link
              href="/reports"
              className="rounded-lg border p-4 transition hover:opacity-80"
              style={{ background: PALETTE.surface, borderColor: PALETTE.border }}
            >
              <div className="text-[10px] uppercase tracking-wider" style={{ color: PALETTE.muted }}>Revenue year-to-date</div>
              <div className="mt-1 text-2xl font-semibold" style={{ color: PALETTE.text }}>
                {formatCurrency(summary.revenueThisYear)}
              </div>
              <div className="mt-2 text-[11px]" style={{ color: PALETTE.muted }}>
                Avg booking {formatCurrency(summary.avgBookingValue)}
              </div>
            </Link>
          </div>
        </section>

        {/* ===== 5. TOP ARTISTS ===== */}
        {topTalent.length > 0 && (
          <section>
            <div className="mb-3 flex items-baseline justify-between">
              <h2 className="text-sm font-semibold" style={{ color: PALETTE.text }}>
                Top artists
              </h2>
              <Link href="/talent" className="text-[11px]" style={{ color: PALETTE.accent }}>
                See all artists →
              </Link>
            </div>
            <div className="flex gap-3 overflow-x-auto pb-2" style={{ scrollbarWidth: 'thin' }}>
              {topTalent.map((t) => (
                <Link
                  key={t.talentId}
                  href={`/talent/${t.talentId}`}
                  className="flex-none rounded-lg border p-4 transition hover:opacity-80"
                  style={{
                    background: PALETTE.surface,
                    borderColor: PALETTE.border,
                    width: 200,
                  }}
                >
                  <div className="text-sm font-semibold truncate" style={{ color: PALETTE.text }}>
                    {t.name}
                  </div>
                  {t.discipline && (
                    <div className="text-[11px] mt-0.5 truncate" style={{ color: PALETTE.accent }}>
                      {humanise(t.discipline)}
                    </div>
                  )}
                  <div className="mt-3 grid grid-cols-2 gap-2">
                    <div>
                      <div className="text-[9px] uppercase tracking-wider" style={{ color: PALETTE.muted }}>Bookings</div>
                      <div className="text-sm font-semibold" style={{ color: PALETTE.text }}>{t.bookingCount}</div>
                    </div>
                    <div>
                      <div className="text-[9px] uppercase tracking-wider" style={{ color: PALETTE.muted }}>Revenue</div>
                      <div className="text-sm font-semibold tabular-nums" style={{ color: PALETTE.text }}>
                        {formatCurrency(t.totalRevenue)}
                      </div>
                    </div>
                  </div>
                </Link>
              ))}
            </div>
          </section>
        )}

        {/* ===== 6. RECENT ACTIVITY (collapsed by default) ===== */}
        <details className="rounded-lg border" style={{ background: PALETTE.surface, borderColor: PALETTE.border }}>
          <summary
            className="cursor-pointer px-5 py-3 text-xs font-semibold uppercase tracking-wide select-none"
            style={{ color: PALETTE.muted }}
          >
            Recent activity ({recentEvents.length}) — click to expand
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
                        {ref && (
                          <span className="font-mono text-[10px]" style={{ color: PALETTE.accent }}>{ref}</span>
                        )}
                      </div>
                      {detail && <div className="text-[11px]" style={{ color: PALETTE.muted }}>{detail}</div>}
                      <div className="text-[10px]" style={{ color: '#6b6b6b' }}>
                        {formatDateTime(e.created_at)}
                        {e.actor ? ` · ${e.actor}` : ''}
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
