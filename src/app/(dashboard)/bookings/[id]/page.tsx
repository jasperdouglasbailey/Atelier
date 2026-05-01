import { notFound } from 'next/navigation';
import Topbar from '@/components/layout/Topbar';
import BookingDetail from '@/components/bookings/BookingDetail';
import BookingTimeline from '@/components/bookings/BookingTimeline';
import HoldRequestsTrigger from '@/components/bookings/HoldRequestsTrigger';
import OTExpenseEntry from '@/components/bookings/OTExpenseEntry';
import MorningAfterChecklist from '@/components/bookings/MorningAfterChecklist';
import BriefParser from '@/components/bookings/BriefParser';
import QuoteBuilder from '@/components/quotes/QuoteBuilder';
import UsageLicenceBuilder from '@/components/quotes/UsageLicenceBuilder';
import BookingTeam from '@/components/bookings/BookingTeam';
import { getBooking } from '@/lib/data/bookings';
import { listEvents } from '@/lib/utils/events';
import { listQuoteVersions, getLatestQuoteVersion, listFeeLinesForBooking, listBookingTalent, listBookingCrew } from '@/lib/data/quotes';
import { listUsageLicences } from '@/lib/data/usage-licences';
import { listTalent, listCrew } from '@/lib/data/entities';

type Props = { params: Promise<{ id: string }> };

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

  return (
    <>
      <Topbar title={booking.booking_ref ?? booking.title} />
      <div className="p-4 sm:p-6">
        <div className="grid gap-6 lg:grid-cols-3">
          <div className="lg:col-span-2 space-y-6">
            <BookingDetail booking={booking} />
            {/* Brief parser — show when raw text is present and state is early */}
            {booking.brief_raw_text && ['brief_received', 'brief_parsed'].includes(booking.state) && (
              <BriefParser
                bookingId={id}
                hasBriefText={!!booking.brief_raw_text}
                currentState={booking.state}
              />
            )}
            <HoldRequestsTrigger
              bookingId={id}
              bookingState={booking.state}
              pendingCrewCount={bookingCrew.filter((c) => c.status === 'hold_requested').length}
            />
            {/* Morning-after check workflow */}
            {booking.state === 'morning_after_check' && (
              <MorningAfterChecklist
                bookingId={id}
                bookingRef={booking.booking_ref}
              />
            )}
            {/* OT/expense window — show when window is open or recently closed */}
            {booking.ot_expenses_window_end && (
              <OTExpenseEntry
                bookingId={id}
                quoteVersionId={latestQuote?.id ?? ''}
                windowEnd={booking.ot_expenses_window_end}
                isLocked={booking.ot_expenses_locked}
                bookingCrew={bookingCrew}
              />
            )}
            <div className="rounded-lg border p-4" style={{ background: '#141414', borderColor: '#262626' }}>
              <QuoteBuilder
                bookingId={id}
                quoteVersions={quoteVersions}
                feeLines={feeLines}
              />
            </div>
            <div className="rounded-lg border p-4" style={{ background: '#141414', borderColor: '#262626' }}>
              <UsageLicenceBuilder bookingId={id} licences={usageLicences} />
            </div>
            <BookingTeam
              bookingId={id}
              bookingTalent={bookingTalent}
              bookingCrew={bookingCrew}
              allTalent={allTalent}
              allCrew={allCrew}
            />
          </div>
          <div>
            <BookingTimeline events={events} />
          </div>
        </div>
      </div>
    </>
  );
}
