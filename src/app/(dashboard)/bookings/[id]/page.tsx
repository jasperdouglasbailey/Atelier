import { notFound } from 'next/navigation';
import Topbar from '@/components/layout/Topbar';
import BookingDetail from '@/components/bookings/BookingDetail';
import BookingTimeline from '@/components/bookings/BookingTimeline';
import { getBooking } from '@/lib/data/bookings';
import { listEvents } from '@/lib/utils/events';

type Props = { params: Promise<{ id: string }> };

export default async function BookingDetailPage({ params }: Props) {
  const { id } = await params;
  const booking = await getBooking(id);
  if (!booking) notFound();

  const events = await listEvents({ bookingId: id, limit: 30 });

  return (
    <>
      <Topbar title={booking.booking_ref ?? booking.title} />
      <div className="p-4 sm:p-6">
        <div className="grid gap-6 lg:grid-cols-3">
          <div className="lg:col-span-2">
            <BookingDetail booking={booking} />
          </div>
          <div>
            <BookingTimeline events={events} />
          </div>
        </div>
      </div>
    </>
  );
}
