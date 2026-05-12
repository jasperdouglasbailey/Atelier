import { Suspense } from 'react';
import { notFound } from 'next/navigation';
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
import BookingLifecycleControls from '@/components/bookings/BookingLifecycleControls';
import { getBookingDetail } from '@/lib/data/booking-detail';
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
import type { BookingTalent, BookingCrew } from '@/lib/types/database';

type Props = { params: Promise<{ id: string }> };

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

export default async function BookingDetailPage({ params }: Props) {
  const { id } = await params;
  const detail = await getBookingDetail(id);
  if (!detail) notFound();

  const {
    booking, events, quoteVersions, latestQuote, feeLines,
    bookingTalent, bookingCrew, usageLicences, allTalent, allCrew,
    preferredCrewIds, ratePrecedents, crewConflictsByCrewId,
  } = detail;

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
      <div className="p-4 sm:p-6">
        <div className="grid gap-6 lg:grid-cols-3">
          <div className="lg:col-span-2 space-y-6">
            <BookingDetail
              booking={booking}
              licences={usageLicences}
              googleConfigured={isGoogleConfigured()}
              checklist={checklist}
              showWorkspaceShortcut={showWorkspaceShortcut}
              talentNames={bookingTalent.map((bt) => (bt.talent as { working_name?: string } | null)?.working_name ?? '').filter(Boolean)}
              preflight={{
                talentCount: bookingTalent.length,
                feeLineCount: feeLines.length,
                hasDeliverables: !!(booking.deliverables_type),
                usageLicenceCount: usageLicences.length,
              }}
            />

            {booking.brief_raw_text && ['brief_received', 'brief_parsed'].includes(booking.state) && (
              <BriefParser
                bookingId={id}
                hasBriefText={!!booking.brief_raw_text}
                currentState={booking.state}
              />
            )}

            <BookingTeam
              bookingId={id}
              bookingTalent={bookingTalent}
              bookingCrew={bookingCrew}
              allTalent={allTalent}
              allCrew={allCrew}
              shootLocation={booking.shoot_location}
              crewConflictsByCrewId={crewConflictsByCrewId}
              preferredCrewIds={preferredCrewIds}
              primaryTalentName={bookingTalent[0]?.talent?.name ?? null}
            />

            <HoldRequestsTrigger
              bookingId={id}
              bookingState={booking.state}
              pendingCrewCount={bookingCrew.filter((c) => c.status === 'hold_requested').length}
            />

            <div
              className="rounded-lg border p-4"
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

            <Suspense fallback={null}>
              <StreamingPrecedents
                primaryTalentId={primaryTalentId}
                clientId={booking.client_id ?? null}
                tier={booking.tier}
                proposedDayRate={proposedDayRate}
                proposedGrandTotal={booking.grand_total}
              />
            </Suspense>

            {booking.state === 'morning_after_check' && (
              <div id="morning-after">
                <MorningAfterChecklist bookingId={id} bookingRef={booking.booking_ref} />
              </div>
            )}
            {booking.ot_expenses_window_end && (
              <OTExpenseEntry
                bookingId={id}
                quoteVersionId={latestQuote?.id ?? ''}
                windowEnd={booking.ot_expenses_window_end}
                isLocked={booking.ot_expenses_locked}
                bookingCrew={bookingCrew}
              />
            )}
            <JobPnLPanel feeLines={feeLines} latestQuote={latestQuote} />

            {(booking.state === 'invoice_issued' || booking.state === 'paid') && (
              <PayrollPanel
                bookingId={id}
                bookingTalent={bookingTalent as BookingTalent[]}
                bookingCrew={bookingCrew as BookingCrew[]}
              />
            )}

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

            <BookingLifecycleControls
              bookingId={id}
              bookingRef={booking.booking_ref}
              bookingState={booking.state}
              isArchived={(booking as { is_archived?: boolean }).is_archived ?? false}
            />
          </div>

          <div className="space-y-6">
            <FilesPanel booking={booking} />
            <AgencyNotesPanel bookingId={id} agencyNotes={booking.agency_notes} />
            <CollapsibleTimeline events={events} />
          </div>
        </div>
      </div>
    </>
  );
}
