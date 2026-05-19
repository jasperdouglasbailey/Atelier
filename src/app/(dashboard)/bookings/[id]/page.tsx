import { Suspense } from 'react';
import { notFound } from 'next/navigation';
import { withTiming } from '@/lib/utils/perf-trace';
import Topbar from '@/components/layout/Topbar';
import BookingDetail from '@/components/bookings/BookingDetail';
import FilesPanel from '@/components/bookings/FilesPanel';
import AgencyNotesPanel from '@/components/bookings/AgencyNotesPanel';
import CollapsibleTimeline from '@/components/bookings/CollapsibleTimeline';
import HoldRequestsTrigger from '@/components/bookings/HoldRequestsTrigger';
import OTExpenseEntry from '@/components/bookings/OTExpenseEntry';
import MorningAfterChecklist from '@/components/bookings/MorningAfterChecklist';
import BriefParser from '@/components/bookings/BriefParser';
import QuoteBuilder from '@/components/quotes/QuoteBuilder';
import BookingTeam from '@/components/bookings/BookingTeam';
import BookingTabs from '@/components/bookings/BookingTabs';
import { getBookingDetail } from '@/lib/data/booking-detail';
import { getCachedActiveClients } from '@/lib/data/entities-cache';
import { getTalentRateBand, getClientRateBand, getTalentClientHistory, getClientCorpusSignal } from '@/lib/data/precedents';
import PrecedentSignals from '@/components/bookings/PrecedentSignals';
import { searchInbox } from '@/lib/integrations/gmail';
import { isGoogleConfigured } from '@/lib/integrations/google-auth';
import BookingComms from '@/components/bookings/BookingComms';
import PayrollPanel from '@/components/bookings/PayrollPanel';
import JobPnLPanel from '@/components/bookings/JobPnLPanel';
import QuickCompose from '@/components/bookings/QuickCompose';
import { PALETTE } from '@/lib/utils/constants';
import { getStageChecklist, stageOf } from '@/lib/utils/booking-stages';
import { listTasksForBooking } from '@/lib/data/tasks';
import { listAppUsers } from '@/lib/data/app-users';
import { countPendingHoldApprovals } from '@/lib/data/approvals';
import TasksPanel from '@/components/tasks/TasksPanel';
import SchedulesPanel from '@/components/bookings/SchedulesPanel';
import { parseDateRangeRaw } from '@/lib/utils/daterange';
import type { BookingTalent, BookingCrew } from '@/lib/types/database';
import BookingPageHeader from '@/components/bookings/BookingPageHeader';
import BookingJobFacts from '@/components/bookings/BookingJobFacts';
import StageChecklist from '@/components/bookings/StageChecklist';
import { getBookingsRoster } from '@/lib/data/booking-roster';
import BookingMiniCalendar from '@/components/bookings/BookingMiniCalendar';
import ActivityFeed from '@/components/bookings/ActivityFeed';

type Props = {
  params: Promise<{ id: string }>;
  searchParams?: Promise<{ action?: string }>;
};

async function StreamingComms({ bookingRef }: { bookingRef: string | null }) {
  if (!bookingRef) return null;
  const threads = await searchInbox(bookingRef, 20).catch(() => []);
  return <BookingComms bookingRef={bookingRef} threads={threads} isConfigured={isGoogleConfigured()} />;
}

function CommsLoadingFallback({ bookingRef }: { bookingRef: string | null }) {
  if (!bookingRef) return null;
  return (
    <section
      className="rounded-lg border px-4 py-3"
      style={{ background: PALETTE.surface, borderColor: PALETTE.border, color: PALETTE.muted }}
    >
      <p className="text-xs">
        <span className="font-semibold uppercase tracking-wide">Comms — {bookingRef}</span>
        <span className="ml-2 opacity-70">loading from Gmail…</span>
      </p>
    </section>
  );
}

async function StreamingPrecedents({
  primaryTalentId, clientId, tier, proposedDayRate, proposedGrandTotal,
}: {
  primaryTalentId: string | null;
  clientId: string | null;
  tier: string;
  proposedDayRate: number | null;
  proposedGrandTotal: number | null;
}) {
  const bookingTier = tier as Parameters<typeof getTalentRateBand>[0]['tier'];
  const [talentBand, clientBand, talentClientHistory, clientCorpus] = await Promise.all([
    primaryTalentId ? getTalentRateBand({ talentId: primaryTalentId, tier: bookingTier }) : Promise.resolve(null),
    clientId ? getClientRateBand({ clientId, tier: bookingTier }) : Promise.resolve(null),
    primaryTalentId && clientId ? getTalentClientHistory({ talentId: primaryTalentId, clientId }) : Promise.resolve([]),
    clientId ? getClientCorpusSignal({ clientId, tier: bookingTier }) : Promise.resolve(null),
  ]);
  return (
    <PrecedentSignals
      talentBand={talentBand}
      clientBand={clientBand}
      talentClientHistory={talentClientHistory}
      clientCorpus={clientCorpus}
      proposedDayRate={proposedDayRate}
      proposedGrandTotal={proposedGrandTotal}
    />
  );
}

export default async function BookingDetailPage({ params, searchParams }: Props) {
  const { id } = await params;
  const sp = (await searchParams) ?? {};
  // ?action=parse triggers BriefParser to auto-run its parse on mount.
  // Set by the StageChecklist "Parse brief" CTA so the user gets a
  // one-click flow from the top of the page.
  const autoParseBrief = sp.action === 'parse';
  // All fetches go through withTiming so we get one log line per query
  // when PERF_TRACE_ENABLED=1. The TOTAL_FETCH label wraps the whole
  // wave so we can read end-to-end cost from a single line, but the
  // wrapping is also what avoids a bare `performance.now()` in the
  // component body (which React's purity lint blocks in server
  // components). See src/lib/utils/perf-trace.ts.
  const { detail, bookingTasks, allAppUsers, rosterMap, pendingHoldCount, allClients } = await withTiming(
    'booking-page.TOTAL_FETCH',
    async () => {
      const d = await withTiming('booking-page.getBookingDetail', () => getBookingDetail(id));
      if (!d) return { detail: null as Awaited<ReturnType<typeof getBookingDetail>>, bookingTasks: [], allAppUsers: [], rosterMap: new Map(), pendingHoldCount: 0, allClients: [] };
      const [tasks, users, roster, holdCount, clients] = await Promise.all([
        withTiming('booking-page.listTasksForBooking', () => listTasksForBooking(id)),
        withTiming('booking-page.listAppUsers', () => listAppUsers()),
        withTiming('booking-page.getBookingsRoster', () => getBookingsRoster([id])),
        withTiming('booking-page.countPendingHoldApprovals', () => countPendingHoldApprovals(id)),
        // Active clients for the inline Client picker in JobFacts. Cached
        // (entities tag) — invalidated by entity mutation actions.
        withTiming('booking-page.getCachedActiveClients', () => getCachedActiveClients()),
      ]);
      return {
        detail: d,
        bookingTasks: tasks,
        allAppUsers: users,
        rosterMap: roster,
        pendingHoldCount: holdCount,
        allClients: clients,
      };
    },
  );
  if (!detail) notFound();
  const roster = rosterMap.get(id) ?? null;

  // Surface only id/name/company/is_creative_agency for the JobFacts
  // pickers (client + agency). Keeps the client payload small and avoids
  // leaking full client records to the page if not needed elsewhere.
  const clientOptions = allClients.map((c) => ({
    id: c.id,
    name: c.name,
    company: c.company ?? null,
    is_creative_agency: c.is_creative_agency,
  }));

  const {
    booking, events, quoteVersions, latestQuote, feeLines,
    bookingTalent, bookingCrew, usageLicences, allTalent, allCrew,
    preferredCrewIds, ratePrecedents, crewConflictsByCrewId, talentUnavailByTalentId, schedules,
  } = detail!;

  // Expand shoot_dates range into individual day strings for the SchedulesPanel picker.
  const shootRange = parseDateRangeRaw(booking.shoot_dates);
  const shootDays: string[] = [];
  if (shootRange.start) {
    const endDate = shootRange.end
      ? (() => { const d = new Date(shootRange.end + 'T00:00:00Z'); d.setUTCDate(d.getUTCDate() - 1); return d; })()
      : new Date(shootRange.start + 'T00:00:00Z');
    const cur = new Date(shootRange.start + 'T00:00:00Z');
    while (cur <= endDate) {
      shootDays.push(cur.toISOString().slice(0, 10));
      cur.setUTCDate(cur.getUTCDate() + 1);
    }
  }

  const taskAssignees = allAppUsers
    .filter((u) => u.is_active && (u.role === 'owner' || u.role === 'partner'))
    .map((u) => ({ userId: u.user_id, displayName: u.display_name ?? u.user_id }));

  // Co-managing agents: distinct assigned_agent_user_id values across all
  // talent on this booking, mapped to display names. The header shows a
  // "Co-managing" line when 2+ — surfaces collaboration on multi-agent
  // bookings (e.g. one client wants Oliver + Maria, who are on different
  // agents' rosters). Phase 1 multi-agent rollout.
  const userDisplayNameByUserId = new Map(
    allAppUsers.map((u) => [u.user_id, u.display_name ?? u.user_id.slice(0, 8)]),
  );
  const coManagingAgents = Array.from(new Set(
    (bookingTalent as Array<{ talent?: { assigned_agent_user_id?: string | null } | null }>)
      .map((bt) => bt.talent?.assigned_agent_user_id ?? null)
      .filter((id): id is string => typeof id === 'string'),
  )).map((id) => userDisplayNameByUserId.get(id) ?? 'Unknown agent');

  const primaryTalentId = bookingTalent[0]?.talent_id ?? null;
  const proposedDayRate = bookingTalent[0]?.day_rate ?? null;
  const stage = stageOf(booking.state);
  const showWorkspaceShortcut = stage === 'brief' || booking.state === 'quote_drafted';

  const checklist = getStageChecklist({
    booking,
    bookingTalent: bookingTalent as BookingTalent[],
    bookingCrew: bookingCrew as BookingCrew[],
    usageLicences,
    latestQuote,
    feeLines,
  });

  return (
    <>
      <Topbar title={booking.booking_ref ?? booking.title} />

      {/* Page-level header: breadcrumb, serif title, stage pills, metadata strip */}
      <BookingPageHeader
        booking={booking}
        bookingTalent={bookingTalent}
        roster={roster}
        coManagingAgents={coManagingAgents}
      />

      <div className="p-4 sm:p-6">
        <BookingTabs
          overview={
            <>
              {/* Two-column layout: main content | fixed right rail */}
              <div className="grid grid-cols-1 lg:grid-cols-[1fr_320px] gap-6 items-start">
                {/* LEFT — checklist + CTA strip + job facts + brief parser */}
                <div className="space-y-4">
                  <StageChecklist checklist={checklist} />

                  <BookingDetail
                    booking={booking}
                    licences={usageLicences}
                    googleConfigured={isGoogleConfigured()}
                    checklist={checklist}
                    showWorkspaceShortcut={showWorkspaceShortcut}
                    suppressHeader
                    talentNames={bookingTalent.map((bt) => (bt.talent as { working_name?: string } | null)?.working_name ?? '').filter(Boolean)}
                    preflight={{
                      talentCount: bookingTalent.length,
                      feeLineCount: feeLines.length,
                      hasDeliverables: !!(booking.deliverables_type),
                      usageLicenceCount: usageLicences.length,
                    }}
                  />

                  <BookingJobFacts booking={booking} schedules={schedules} clients={clientOptions} />

                  {/* Usage Licences — surface its own section here. Previously
                      this was nested inside BookingDetail's Brief panel which
                      is hidden when suppressHeader is set (always, on this
                      page), so the usage panel was effectively orphaned. */}
                  <section
                    className="rounded-lg border p-4 space-y-3"
                    style={{ background: PALETTE.surface, borderColor: PALETTE.border }}
                  >
                    {/* Structured taxonomy strip — read-only chips of the
                        market / realm / media categories / territories
                        extracted by the brief-intake LLM (PR #169) and
                        persisted via migration 0059. Hidden when nothing has
                        been extracted yet. */}
                    {(booking.usage_market || booking.usage_realm ||
                      (booking.usage_media_categories?.length ?? 0) > 0 ||
                      (booking.usage_specific_channels?.length ?? 0) > 0 ||
                      (booking.usage_territory_iso?.length ?? 0) > 0) && (
                      <div className="pb-2 border-b" style={{ borderColor: PALETTE.border }}>
                        <div className="text-[10px] font-semibold uppercase tracking-wide mb-1.5" style={{ color: PALETTE.muted }}>
                          Usage taxonomy
                        </div>
                        <div className="flex flex-wrap gap-1.5 items-center">
                          {booking.usage_market && (
                            <span className="rounded px-2 py-0.5 text-[11px]" style={{ background: `${PALETTE.accent}22`, color: PALETTE.accent }}>
                              {booking.usage_market}
                            </span>
                          )}
                          {booking.usage_realm && (
                            <span className="rounded px-2 py-0.5 text-[11px]" style={{ background: `${PALETTE.accent}22`, color: PALETTE.accent }}>
                              {booking.usage_realm}
                            </span>
                          )}
                          {booking.usage_media_categories?.map((c) => (
                            <span key={c} className="rounded px-2 py-0.5 text-[11px]" style={{ background: `${PALETTE.warning}22`, color: PALETTE.warning }}>
                              {c}
                            </span>
                          ))}
                          {booking.usage_territory_iso?.map((t) => (
                            <span key={t} className="rounded px-2 py-0.5 text-[11px] font-mono" style={{ background: `${PALETTE.success}22`, color: PALETTE.success }}>
                              {t}
                            </span>
                          ))}
                        </div>
                        {(booking.usage_specific_channels?.length ?? 0) > 0 && (
                          <div className="flex flex-wrap gap-x-2 items-center mt-1">
                            <span className="text-[10px]" style={{ color: PALETTE.muted }}>Channels:</span>
                            <span className="text-[10px] font-mono" style={{ color: PALETTE.muted }}>
                              {booking.usage_specific_channels?.join(' · ')}
                            </span>
                          </div>
                        )}
                      </div>
                    )}
                    {/* UsageLicenceBuilder retired 2026-05-19 — usage is now
                        captured booking-level via the structured taxonomy
                        strip above (PR#170 fields). The per-talent
                        atelier_usage_licences table stays for backward compat
                        but isn't surfaced in the UI. */}
                  </section>

                  {booking.brief_raw_text && ['brief_received', 'brief_parsed'].includes(booking.state) && (
                    <BriefParser
                      bookingId={id}
                      hasBriefText={!!booking.brief_raw_text}
                      currentState={booking.state}
                      autoParseOnMount={autoParseBrief}
                    />
                  )}

                  {booking.state === 'morning_after_check' && (
                    <div id="morning-after">
                      <MorningAfterChecklist bookingId={id} bookingRef={booking.booking_ref} />
                    </div>
                  )}
                </div>

                {/* RIGHT RAIL — mini calendar + activity feed */}
                <div
                  className="hidden lg:block sticky top-6 rounded border overflow-hidden"
                  style={{ borderColor: 'var(--p-border)', background: 'var(--p-surface)' }}
                >
                  <BookingMiniCalendar shootDates={booking.shoot_dates} />
                  <ActivityFeed events={events} />
                </div>
              </div>
            </>
          }
          finance={
            <>
              {/* Quote (flexible) + Job P&L (fixed 360px) on wide screens, stacked below xl */}
              <div className="grid grid-cols-1 xl:grid-cols-[minmax(0,1fr)_360px] gap-4 items-start">
                <div
                  className="rounded-lg border p-4 min-w-0"
                  style={{ background: PALETTE.surface, borderColor: PALETTE.border }}
                >
                  <QuoteBuilder
                    bookingId={id}
                    quoteVersions={quoteVersions}
                    feeLines={feeLines}
                    bookingTalent={bookingTalent}
                    bookingCrew={bookingCrew}
                    ratePrecedents={ratePrecedents}
                  />
                </div>

                <JobPnLPanel feeLines={feeLines} latestQuote={latestQuote} bookingTalent={bookingTalent} bookingCrew={bookingCrew} />
              </div>

              <details className="rounded-lg border" style={{ background: PALETTE.surface, borderColor: PALETTE.border }}>
                <summary
                  className="cursor-pointer px-4 py-2 text-xs font-semibold uppercase tracking-wide"
                  style={{ color: PALETTE.muted, listStyle: 'none', display: 'flex', alignItems: 'center', gap: 6 }}
                >
                  <span>Precedent signals</span>
                </summary>
                <div className="px-4 pb-4">
                  <Suspense fallback={null}>
                    <StreamingPrecedents
                      primaryTalentId={primaryTalentId}
                      clientId={booking.client_id ?? null}
                      tier={booking.tier}
                      proposedDayRate={proposedDayRate}
                      proposedGrandTotal={booking.grand_total}
                    />
                  </Suspense>
                </div>
              </details>

              {booking.ot_expenses_window_end && (
                <OTExpenseEntry
                  bookingId={id}
                  quoteVersionId={latestQuote?.id ?? ''}
                  windowEnd={booking.ot_expenses_window_end}
                  isLocked={booking.ot_expenses_locked}
                  bookingCrew={bookingCrew}
                />
              )}

              {(booking.state === 'invoice_issued' || booking.state === 'paid') && (
                <PayrollPanel
                  bookingId={id}
                  bookingTalent={bookingTalent as BookingTalent[]}
                  bookingCrew={bookingCrew as BookingCrew[]}
                />
              )}
            </>
          }
          team={
            <>
              <BookingTeam
                bookingId={id}
                bookingTalent={bookingTalent}
                bookingCrew={bookingCrew}
                allTalent={allTalent}
                allCrew={allCrew}
                shootDays={shootDays}
                shootLocation={booking.shoot_location}
                crewConflictsByCrewId={crewConflictsByCrewId}
                talentUnavailByTalentId={talentUnavailByTalentId}
                preferredCrewIds={preferredCrewIds}
                primaryTalentName={bookingTalent[0]?.talent?.name ?? null}
                pendingHoldCount={pendingHoldCount}
              />

              <HoldRequestsTrigger
                bookingId={id}
                bookingState={booking.state}
                pendingCrewCount={bookingCrew.filter((c) => c.status === 'hold_requested').length}
              />

              <section className="rounded-lg border p-4" style={{ background: PALETTE.surface, borderColor: PALETTE.border }}>
                <h2 className="section-title mb-3">Schedule</h2>
                <SchedulesPanel bookingId={id} initial={schedules} shootDays={shootDays} />
              </section>

              <section className="rounded-lg border p-4" style={{ background: PALETTE.surface, borderColor: PALETTE.border }}>
                <h2 className="section-title mb-3">Tasks</h2>
                <TasksPanel
                  initial={bookingTasks}
                  attachment={{ type: 'booking', id }}
                  assignees={taskAssignees}
                />
              </section>
            </>
          }
          documents={
            <>
              <FilesPanel booking={booking} />
              <AgencyNotesPanel bookingId={id} agencyNotes={booking.agency_notes} />
            </>
          }
          comms={
            <>
              <Suspense fallback={<CommsLoadingFallback bookingRef={booking.booking_ref} />}>
                <StreamingComms bookingRef={booking.booking_ref} />
              </Suspense>
              <QuickCompose
                bookingId={id}
                bookingRef={booking.booking_ref}
                bookingTitle={booking.title}
                defaultTo={booking.client?.email ?? null}
                googleConfigured={isGoogleConfigured()}
              />
            </>
          }
          activity={
            <CollapsibleTimeline events={events} />
          }
        />
      </div>
    </>
  );
}
