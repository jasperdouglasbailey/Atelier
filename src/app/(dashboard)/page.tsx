import Link from 'next/link';
import Topbar from '@/components/layout/Topbar';
import { getUpcomingShoots, getAttentionItems, getOverdueInvoices } from '@/lib/data/bookings';
import { getBookingsRoster } from '@/lib/data/booking-roster';
import { listApprovals } from '@/lib/data/approvals';
import { getCachedBookingCounts, getCachedReportSummary } from '@/lib/data/dashboard-cache';
import { runHealthProbes } from '@/lib/utils/health';
import { getCurrentAppUser } from '@/lib/data/app-users';
import { getKillSwitchState } from '@/lib/utils/kill-switch';
import { findPotentialBriefs } from '@/lib/integrations/gmail';
import { isGoogleConfigured } from '@/lib/integrations/google-auth';
import { listDismissedBriefIds } from '@/lib/data/dismissed-briefs';
import { createClient } from '@/lib/supabase/server';
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
import { formatCurrency } from '@/lib/utils/format';
import BookingHoverCard from '@/components/bookings/BookingHoverCard';
import GreetingHeader from '@/components/dashboard/GreetingHeader';
import MiniMonthCalendar from '@/components/dashboard/MiniMonthCalendar';
import FinanceSection from '@/components/dashboard/FinanceSection';
import InboxPreview from '@/components/dashboard/InboxPreview';
import SettingsSnapshot from '@/components/dashboard/SettingsSnapshot';
import SectionCard from '@/components/ui/SectionCard';
import { humanise } from '@/lib/utils/humanise';
import type { ThisWeekCrew, JobNeedingCrew } from '@/lib/data/dashboard';

// ============================================================================
// Dashboard — redesigned session 14 (round 2) to match Jasper's sketched
// 3-column / 4-row grid layout. Same 1+2 column split across all rows so
// every panel lines up cleanly.
//
//   Row 1 (full): Greeting strip
//   Row 2 (3-col): Calendar | Upcoming shoots (top) + Crew-on-hold + Jobs-needing-crew (bottom, split)
//   Row 3 (3-col): Pipeline | Inbox (2-col wide)
//   Row 4 (3-col): Kill switch | Finance (2-col wide, 4 metrics)
//
// Conditional rows above the main grid (only render when there's content):
//   Health banner (failure only)
//   Attention queue (only when items exist)
//
// Sections deliberately dropped from the previous redesign:
//   Talent-working-this-week — duplicative with Upcoming Shoots' primary artist
//   Top artists — moved to /reports where it belongs
//   Recent activity — low signal, available via /audit
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
  // Server components are allowed to call new Date() (purity rule scoped to client).
  const now = new Date();
  const year = now.getFullYear();
  const month = now.getMonth();
  const week = thisWeekRange(now);

  const [
    counts, upcoming, attentionItems, summary,
    overdueInvoices, healthProbes,
    appUser, killSwitch,
    monthMarkers, weekBookings, jobsNeedingCrew, pendingApprovals,
    potentialBriefs,
  ] = await Promise.all([
    getCachedBookingCounts(),
    getUpcomingShoots(),
    getAttentionItems(),
    getCachedReportSummary(),
    getOverdueInvoices(),
    runHealthProbes(),
    getCurrentAppUser(),
    getKillSwitchState(),
    getMonthShootMarkers(year, month),
    getBookingsInRange(week.start, week.end),
    getJobsNeedingCrew(),
    listApprovals('pending'),
    fetchPotentialBriefsForDashboard(),
  ]);

  const weekBookingIds = weekBookings.map((b) => b.id);
  const [weekRoster, upcomingRoster] = await Promise.all([
    getThisWeekRoster(weekBookingIds),
    upcoming.length > 0 ? getBookingsRoster(upcoming.map((b) => b.id)) : Promise.resolve(new Map()),
  ]);

  const failedProbes = healthProbes.filter((p) => !p.ok);
  // Server component renders once per request — Date.now() is stable within
  // the render. Lint rule is conservative; suppression is intentional here.
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

  const overdueTotal = overdueInvoices.reduce((s, inv) => s + inv.grand_total, 0);

  const role = appUser?.role ?? 'owner';

  return (
    <>
      <Topbar title="Dashboard" />
      <div className="p-4 sm:p-6 space-y-4">

        {/* ── Row 1. GREETING STRIP — full width, subtle background ────── */}
        <section
          className="rounded-lg border px-5 py-4 sm:px-6 sm:py-5"
          style={{ background: PALETTE.surface, borderColor: PALETTE.border }}
        >
          <GreetingHeader
            displayName={appUser?.display_name ?? null}
            role={role}
          />
        </section>

        {/* ── Conditional: Health banner (failure only) ──────────────── */}
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

        {/* ── Conditional: Attention queue (only when items exist) ────── */}
        {totalAttentionCount > 0 && (
          <SectionCard
            title="Needs attention"
            meta={`${totalAttentionCount} item${totalAttentionCount === 1 ? '' : 's'}`}
          >
            <div className="space-y-2">
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

              {sortedAttentionItems.map((item) => {
                const cfg = ATTENTION_CONFIG[item.state] ?? { action: 'Review', urgency: 'low' };
                const color = urgencyColor[cfg.urgency];
                const clientLabel = item.client_company || item.client_name || null;
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

        {/* ── Row 2. CALENDAR (1/3) │ UPCOMING + CREW/JOBS (2/3) ──────── */}
        {/* lg:items-stretch makes both columns share the tallest height so
            the right-side nested layout can fill it via flex-1. */}
        <div className="grid gap-4 lg:grid-cols-3 lg:items-stretch">
          <div className="lg:col-span-1 flex">
            <MiniMonthCalendar
              year={year}
              month={month}
              shootMarkers={monthMarkers}
              today={now}
              className="h-full w-full"
            />
          </div>
          <div className="lg:col-span-2 flex flex-col gap-4">
            <UpcomingShootsCard
              upcoming={upcoming}
              upcomingRoster={upcomingRoster}
            />
            {/* flex-1 → this nested grid eats remaining vertical space so the
                Crew + Jobs cards stretch to meet Calendar's bottom edge. */}
            <div className="grid flex-1 gap-4 sm:grid-cols-2">
              <CrewOnHoldCard rows={weekRoster.crewOnHold} className="h-full" />
              <JobsNeedingCrewCard rows={jobsNeedingCrew} className="h-full" />
            </div>
          </div>
        </div>

        {/* ── Row 3. PIPELINE (1/3) │ INBOX (2/3) ─────────────────────── */}
        <div className="grid gap-4 lg:grid-cols-3 lg:items-stretch">
          <div className="lg:col-span-1 flex">
            <SectionCard
              title="Pipeline"
              meta={`${totalActive} active`}
              action={{ label: 'Bookings', href: '/bookings' }}
              className="h-full w-full"
            >
              {pipeline.length === 0 ? (
                <p className="text-[11px]" style={{ color: PALETTE.muted }}>
                  No active bookings.
                </p>
              ) : (
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
              )}
            </SectionCard>
          </div>
          <div className="lg:col-span-2 flex">
            <InboxPreview
              approvals={pendingApprovals}
              potentialBriefs={potentialBriefs}
              className="h-full w-full"
            />
          </div>
        </div>

        {/* ── Row 4. KILL SWITCH (1/3) │ FINANCE (2/3) ────────────────── */}
        <div className="grid gap-4 lg:grid-cols-3 lg:items-stretch">
          <div className="lg:col-span-1 flex">
            <SettingsSnapshot killSwitch={killSwitch} className="h-full w-full" />
          </div>
          <div className="lg:col-span-2 flex">
            <FinanceSection
              revenueThisWeek={summary.revenueThisWeek}
              revenueThisMonth={summary.revenueThisMonth}
              revenueLastMonth={summary.revenueLastMonth}
              revenueThisYear={summary.revenueThisYear}
              avgBookingValue={summary.avgBookingValue}
              overdueTotal={overdueTotal}
              overdueCount={overdueInvoices.length}
              className="h-full w-full"
            />
          </div>
        </div>

      </div>
    </>
  );
}

// ──────────────────────────────────────────────────────────────────────────
// Sub-components kept inline so this file is the single dashboard source.
// ──────────────────────────────────────────────────────────────────────────

function UpcomingShootsCard({
  upcoming,
  upcomingRoster,
}: {
  upcoming: Awaited<ReturnType<typeof getUpcomingShoots>>;
  upcomingRoster: Awaited<ReturnType<typeof getBookingsRoster>>;
}) {
  return (
    <SectionCard
      title="Upcoming shoots"
      meta={`${upcoming.length}`}
      action={{ label: 'Calendar', href: '/bookings?view=calendar' }}
    >
      {upcoming.length === 0 ? (
        <p className="text-[11px]" style={{ color: PALETTE.muted }}>No shoots scheduled.</p>
      ) : (
        <div className="grid gap-2 sm:grid-cols-2">
          {upcoming.slice(0, 4).map((b) => {
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
                  className="block rounded-md p-3 transition hover:opacity-80"
                  style={{ background: PALETTE.bg }}
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0 flex-1">
                      {primaryArtist && (
                        <div className="text-sm font-semibold truncate" style={{ color: PALETTE.text }}>
                          {primaryArtist}
                          {roster && roster.talent.length > 1 && (
                            <span className="ml-1 text-[11px] font-normal" style={{ color: PALETTE.muted }}>
                              + {roster.talent.length - 1}
                            </span>
                          )}
                        </div>
                      )}
                      <div className="text-[11px] truncate" style={{ color: primaryArtist ? PALETTE.muted : PALETTE.text }}>
                        {b.booking_ref} · {b.title}
                      </div>
                      <div className="mt-0.5 text-[10px] truncate" style={{ color: PALETTE.muted }}>
                        {SHOOT_TIER_LABELS[b.tier]}
                        {b.shoot_date_notes && ` · ${b.shoot_date_notes}`}
                      </div>
                    </div>
                    <span
                      className="rounded-full px-2 py-0.5 text-[9px] font-semibold uppercase flex-none"
                      style={{ background: `${STATE_COLORS[b.state]}22`, color: STATE_COLORS[b.state] }}
                    >
                      {BOOKING_STATE_LABELS[b.state]}
                    </span>
                  </div>
                </Link>
              </BookingHoverCard>
            );
          })}
          {upcoming.length > 4 && (
            <Link
              href="/bookings?view=calendar"
              className="flex items-center justify-center rounded-md text-[11px]"
              style={{ background: PALETTE.bg, color: PALETTE.muted, minHeight: 60 }}
            >
              + {upcoming.length - 4} more shoots →
            </Link>
          )}
        </div>
      )}
    </SectionCard>
  );
}

function CrewOnHoldCard({ rows, className }: { rows: ThisWeekCrew[]; className?: string }) {
  // Dedup by crewId; same person on two shoots only appears once.
  const map = new Map<string, { row: ThisWeekCrew; bookingRefs: string[] }>();
  for (const r of rows) {
    const existing = map.get(r.crewId);
    if (existing) {
      if (r.bookingRef) existing.bookingRefs.push(r.bookingRef);
    } else {
      map.set(r.crewId, { row: r, bookingRefs: r.bookingRef ? [r.bookingRef] : [] });
    }
  }
  const unique = Array.from(map.values());

  return (
    <SectionCard
      title="Crew on hold this week"
      meta={`${unique.length}`}
      action={{ label: 'All crew', href: '/crew' }}
      className={className}
    >
      {unique.length === 0 ? (
        <p className="text-[11px]" style={{ color: PALETTE.muted }}>
          All crew this week are confirmed. Nothing pending.
        </p>
      ) : (
        <ul className="space-y-1">
          {unique.slice(0, 5).map(({ row, bookingRefs }) => (
            <li key={row.crewId}>
              <Link
                href={`/crew/${row.crewId}`}
                className="flex items-baseline justify-between gap-2 rounded px-2 py-1 transition hover:opacity-80"
                style={{ background: PALETTE.bg }}
              >
                <div className="min-w-0 flex-1">
                  <div className="text-xs font-medium truncate" style={{ color: PALETTE.text }}>
                    {row.name}
                  </div>
                  <div className="text-[10px]" style={{ color: PALETTE.muted }}>
                    {row.role ? humanise(row.role) : 'role tbd'} · <span style={{ color: PALETTE.warning }}>{humanise(row.status)}</span>
                  </div>
                </div>
                <span className="text-[10px] font-mono flex-none" style={{ color: PALETTE.accent }}>
                  {bookingRefs[0] ?? ''}
                  {bookingRefs.length > 1 && ` +${bookingRefs.length - 1}`}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </SectionCard>
  );
}

function JobsNeedingCrewCard({ rows, className }: { rows: JobNeedingCrew[]; className?: string }) {
  return (
    <SectionCard
      title="Jobs needing crew"
      meta={`${rows.length}`}
      action={{ label: 'All bookings', href: '/bookings' }}
      className={className}
    >
      {rows.length === 0 ? (
        <p className="text-[11px]" style={{ color: PALETTE.muted }}>
          All confirmed bookings are fully crewed.
        </p>
      ) : (
        <ul className="space-y-1">
          {rows.slice(0, 5).map((j) => (
            <li key={j.bookingId}>
              <Link
                href={`/bookings/${j.bookingId}`}
                className="flex items-baseline justify-between gap-2 rounded px-2 py-1 transition hover:opacity-80"
                style={{ background: PALETTE.bg }}
              >
                <div className="min-w-0 flex-1">
                  <div className="flex items-baseline gap-1.5">
                    <span className="text-[10px] font-mono flex-none" style={{ color: PALETTE.accent }}>
                      {j.bookingRef ?? ''}
                    </span>
                    <span className="text-xs truncate" style={{ color: PALETTE.text }}>{j.title}</span>
                  </div>
                </div>
                <span
                  className="rounded-full px-1.5 py-0.5 text-[10px] font-semibold tabular-nums flex-none"
                  style={{ background: `${PALETTE.warning}22`, color: PALETTE.warning }}
                >
                  {j.unconfirmedCount}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </SectionCard>
  );
}

/**
 * Mirror of /inbox's fetchPotentialBriefs — pulls Gmail messages that look
 * like briefs, filtering out already-dismissed IDs and converted source IDs.
 * Returns an empty array when Google isn't configured so the dashboard
 * stays useful for dev environments without OAuth credentials.
 */
async function fetchPotentialBriefsForDashboard() {
  if (!isGoogleConfigured()) return [];
  const supabase = await createClient();

  const [bookingsResult, convertedResult, clientsResult, talentResult, dismissedIds] = await Promise.all([
    supabase
      .from('atelier_bookings')
      .select('booking_ref')
      .not('booking_ref', 'is', null)
      .limit(500),
    supabase
      .from('atelier_bookings')
      .select('source_gmail_message_id')
      .not('source_gmail_message_id', 'is', null),
    supabase.from('atelier_clients').select('email').not('email', 'is', null),
    supabase.from('atelier_talent').select('working_name').eq('is_active', true),
    listDismissedBriefIds(),
  ]);

  const refs = ((bookingsResult.data ?? []) as { booking_ref: string | null }[])
    .map((r) => r.booking_ref)
    .filter((r): r is string => Boolean(r));

  const convertedSourceIds = new Set(
    ((convertedResult.data ?? []) as { source_gmail_message_id: string | null }[])
      .map((r) => r.source_gmail_message_id)
      .filter((id): id is string => Boolean(id)),
  );

  const clientEmails = ((clientsResult.data ?? []) as { email: string | null }[])
    .map((r) => r.email)
    .filter((e): e is string => Boolean(e));

  const talentNames: string[] = [];
  for (const { working_name } of (talentResult.data ?? []) as { working_name: string }[]) {
    if (!working_name) continue;
    talentNames.push(working_name);
    const firstName = working_name.split(' ')[0];
    if (firstName && firstName.length >= 4) talentNames.push(firstName);
  }

  return findPotentialBriefs({
    existingRefs: refs,
    clientEmails,
    talentNames,
    dismissedIds,
    convertedSourceIds,
    limit: 6,
  });
}
