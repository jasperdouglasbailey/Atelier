import { Suspense } from 'react';
import { notFound } from 'next/navigation';
import Topbar from '@/components/layout/Topbar';
import BookingDetail from '@/components/bookings/BookingDetail';
import CollapsibleTimeline from '@/components/bookings/CollapsibleTimeline';
import HoldRequestsTrigger from '@/components/bookings/HoldRequestsTrigger';
import OTExpenseEntry from '@/components/bookings/OTExpenseEntry';
import MorningAfterChecklist from '@/components/bookings/MorningAfterChecklist';
import BriefParser from '@/components/bookings/BriefParser';
import QuoteBuilder from '@/components/quotes/QuoteBuilder';
import BookingTeam from '@/components/bookings/BookingTeam';
import BookingLifecycleControls from '@/components/bookings/BookingLifecycleControls';
import { getBooking } from '@/lib/data/bookings';
import { listEvents } from '@/lib/utils/events';
import { getCrewBookedOnRange } from '@/lib/data/crew-bookings';
import { parseDateRangeRaw } from '@/lib/utils/daterange';
import { listQuoteVersions, getLatestQuoteVersion, listFeeLinesForBooking, listBookingTalent, listBookingCrew, getTalentRatePrecedents, type RatePrecedent } from '@/lib/data/quotes';
import { getTalentRateBand, getClientRateBand, getTalentClientHistory, getClientCorpusSignal } from '@/lib/data/precedents';
import PrecedentSignals from '@/components/bookings/PrecedentSignals';
import { listUsageLicences } from '@/lib/data/usage-licences';
import { listTalent, listCrew } from '@/lib/data/entities';
import { searchInbox } from '@/lib/integrations/gmail';
import { isGoogleConfigured } from '@/lib/integrations/google-auth';
import BookingComms from '@/components/bookings/BookingComms';
import PayrollPanel from '@/components/bookings/PayrollPanel';
import { PALETTE } from '@/lib/utils/constants';
import { getStageChecklist, stageOf } from '@/lib/utils/booking-stages';
import type { BookingTalent, BookingCrew } from '@/lib/types/database';

type Props = { params: Promise<{ id: string }> };

/**
 * Streamed comms section. The Gmail search runs in parallel with rendering;
 * the rest of the page paints first, then this slot fills in when threads
 * arrive (or immediately, if Google is not configured).
 */
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

export default async function BookingDetailPage({ params }: Props) {
  const { id } = await params;
  const booking = await getBooking(id);
  if (!booking) notFound();

  const [events, quoteVersions, latestQuote, feeLines, bookingTalent, bookingCrew, usageLicences, allTalent, allCrew] = await Promise.all([
    listEvents({ bookingId: id, limit: 30 }),
    listQuoteVersions(id),
    getLatestQuoteVersion(id),
    listFeeLinesForBooking(id),
    listBookingTalent(id),
    listBookingCrew(id),
    listUsageLicences(id),
    listTalent(),
    listCrew(),
  ]);

  // Rate precedents for the primary artist (if any) — helps Jasper price consistently
  const primaryTalentId = bookingTalent[0]?.talent_id ?? null;
  const ratePrecedents: RatePrecedent[] = primaryTalentId
    ? await getTalentRatePrecedents(primaryTalentId, id)
    : [];

  // Phase 3 precedent signals — corpus + live history aggregates
  const proposedDayRate = bookingTalent[0]?.day_rate ?? null;
  const [talentBand, clientBand, talentClientHistory, clientCorpus] = await Promise.all([
    primaryTalentId ? getTalentRateBand({ talentId: primaryTalentId, tier: booking.tier }) : Promise.resolve(null),
    booking.client_id ? getClientRateBand({ clientId: booking.client_id, tier: booking.tier }) : Promise.resolve(null),
    primaryTalentId && booking.client_id
      ? getTalentClientHistory({ talentId: primaryTalentId, clientId: booking.client_id })
      : Promise.resolve([]),
    booking.client_id ? getClientCorpusSignal({ clientId: booking.client_id, tier: booking.tier }) : Promise.resolve(null),
  ]);

  // Stage-aware checklist for the header. Computed server-side so the
  // client component is presentation-only (no data joins in client land).
  const checklist = getStageChecklist({
    booking,
    bookingTalent: bookingTalent as BookingTalent[],
    bookingCrew: bookingCrew as BookingCrew[],
    usageLicences,
    latestQuote,
    feeLines,
  });

  // Crew availability — for any crew member already booked elsewhere on the
  // same dates, BookingTeam flags them with a soft warning so the producer
  // sees the conflict before adding (sometimes intentional double-book is
  // OK; this is a heads-up, not a hard block).
  const shootRange = parseDateRangeRaw(booking.shoot_dates);
  const crewConflictsByCrewId: Record<string, Array<{ bookingId: string; bookingRef: string | null; title: string; start: string; end: string }>> = {};
  if (shootRange.start) {
    let endInclusive = shootRange.end;
    if (shootRange.end) {
      const d = new Date(shootRange.end + 'T00:00:00Z');
      d.setUTCDate(d.getUTCDate() - 1);
      endInclusive = d.toISOString().slice(0, 10);
    }
    const conflicts = await getCrewBookedOnRange({
      startDate: shootRange.start,
      endDate: endInclusive ?? shootRange.start,
      excludeBookingId: id,
    });
    for (const [crewId, bookings] of conflicts) {
      crewConflictsByCrewId[crewId] = bookings;
    }
  }

  // Show the focused workspace shortcut only while the booking is in the
  // brief / quote-drafting phase — afterwards the workspace doesn't help.
  const stage = stageOf(booking.state);
  const showWorkspaceShortcut = stage === 'brief' || booking.state === 'quote_drafted';

  return (
    <>
      <Topbar title={booking.booking_ref ?? booking.title} />
      <div className="p-4 sm:p-6">
        <div className="grid gap-6 lg:grid-cols-3">
          <div className="lg:col-span-2 space-y-6">
            {/* 1. HEADER — identity, stage, what's next, action buttons.
                Owns the brief/usage cards and invoice status (rendered inside). */}
            <BookingDetail
              booking={booking}
              licences={usageLicences}
              googleConfigured={isGoogleConfigured()}
              checklist={checklist}
              showWorkspaceShortcut={showWorkspaceShortcut}
            />

            {/* 2. BRIEF PARSER — only when the brief hasn't been parsed yet. */}
            {booking.brief_raw_text && ['brief_received', 'brief_parsed'].includes(booking.state) && (
              <BriefParser
                bookingId={id}
                hasBriefText={!!booking.brief_raw_text}
                currentState={booking.state}
              />
            )}

            {/* 3. TEAM — moved up from the bottom. Decisions about who is on
                the booking precede pricing, so this comes before the quote. */}
            <BookingTeam
              bookingId={id}
              bookingTalent={bookingTalent}
              bookingCrew={bookingCrew}
              allTalent={allTalent}
              allCrew={allCrew}
              shootLocation={booking.shoot_location}
              crewConflictsByCrewId={crewConflictsByCrewId}
            />

            {/* 4. HOLDS — sits between team and quote. Once talent/crew are
                attached, the agency confirms availability before pricing. */}
            <HoldRequestsTrigger
              bookingId={id}
              bookingState={booking.state}
              pendingCrewCount={bookingCrew.filter((c) => c.status === 'hold_requested').length}
            />

            {/* 5. QUOTE — fee lines, totals, GST passthrough, agency margin.
                Now sits inside the themed `surface` so light mode reads cleanly. */}
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

            {/* 6. PRECEDENT — context for the pricing decision; renders right
                under the quote so it can inform line edits without scrolling. */}
            <PrecedentSignals
              talentBand={talentBand}
              clientBand={clientBand}
              talentClientHistory={talentClientHistory}
              clientCorpus={clientCorpus}
              proposedDayRate={proposedDayRate}
              proposedGrandTotal={booking.grand_total}
            />

            {/* 7. PRODUCTION-CONDITIONAL — morning-after, OT entry, payroll. */}
            {booking.state === 'morning_after_check' && (
              <MorningAfterChecklist
                bookingId={id}
                bookingRef={booking.booking_ref}
              />
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
            {(booking.state === 'invoice_issued' || booking.state === 'paid') && (
              <PayrollPanel
                bookingId={id}
                bookingTalent={bookingTalent as BookingTalent[]}
                bookingCrew={bookingCrew as BookingCrew[]}
              />
            )}

            {/* 8. COMMS — emails sent / received on this booking. */}
            <Suspense fallback={<CommsLoadingFallback bookingRef={booking.booking_ref} />}>
              <StreamingComms bookingRef={booking.booking_ref} />
            </Suspense>

            {/* 9. LIFECYCLE — Archive / Delete controls at the bottom so they
                don't compete with day-to-day actions but are always available. */}
            <BookingLifecycleControls
              bookingId={id}
              bookingRef={booking.booking_ref}
              bookingState={booking.state}
              isArchived={(booking as { is_archived?: boolean }).is_archived ?? false}
            />
          </div>

          {/* Right rail — collapsible timeline (audit trail). Hidden by
              default; available when Jasper wants it. */}
          <div>
            <CollapsibleTimeline events={events} />
          </div>
        </div>
      </div>
    </>
  );
}
