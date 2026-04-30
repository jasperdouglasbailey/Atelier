import { notFound } from 'next/navigation';
import Topbar from '@/components/layout/Topbar';
import BookingDetail from '@/components/bookings/BookingDetail';
import BookingTimeline from '@/components/bookings/BookingTimeline';
import HoldRequestsTrigger from '@/components/bookings/HoldRequestsTrigger';
import QuoteBuilder from '@/components/quotes/QuoteBuilder';
import UsageLicenceBuilder from '@/components/quotes/UsageLicenceBuilder';
import BookingTeam from '@/components/bookings/BookingTeam';
import { getBooking } from '@/lib/data/bookings';
import { listEvents } from '@/lib/utils/events';
import { listQuoteVersions, listFeeLinesForBooking, listBookingTalent, listBookingCrew } from '@/lib/data/quotes';
import { listUsageLicences } from '@/lib/data/usage-licences';
import { listTalent, listCrew } from '@/lib/data/entities';

type Props = { params: Promise<{ id: string }> };

export default async function BookingDetailPage({ params }: Props) {
  const { id } = await params;
  const booking = await getBooking(id);
  if (!booking) notFound();

  const [events, quoteVersions, feeLines, bookingTalent, bookingCrew, usageLicences, allTalent, allCrew] = await Promise.all([
    listEvents({ bookingId: id, limit: 30 }),
    listQuoteVersions(id),
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
            <HoldRequestsTrigger
              bookingId={id}
              bookingState={booking.state}
              pendingCrewCount={bookingCrew.filter((c) => c.status === 'hold_requested').length}
            />
            <div className="rounded-lg border p-4" style={{ background: '#1a1d27', borderColor: '#2e3347' }}>
              <QuoteBuilder
                bookingId={id}
                quoteVersions={quoteVersions}
                feeLines={feeLines}
              />
            </div>
            <div className="rounded-lg border p-4" style={{ background: '#1a1d27', borderColor: '#2e3347' }}>
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
