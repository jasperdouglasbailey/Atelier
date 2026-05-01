import { notFound } from 'next/navigation';
import Link from 'next/link';
import Topbar from '@/components/layout/Topbar';
import BookingEditForm from '@/components/bookings/BookingEditForm';
import { getBooking } from '@/lib/data/bookings';
import { listClients, listBrands } from '@/lib/data/entities';
import { PALETTE } from '@/lib/utils/constants';

type Props = { params: Promise<{ id: string }> };

export default async function BookingEditPage({ params }: Props) {
  const { id } = await params;
  const [booking, clients, brands] = await Promise.all([
    getBooking(id),
    listClients(),
    listBrands(),
  ]);

  if (!booking) notFound();

  return (
    <>
      <Topbar title={`Edit — ${booking.booking_ref ?? booking.title}`} />
      <div className="p-4 sm:p-6 max-w-2xl">
        <div className="mb-4">
          <Link
            href={`/bookings/${id}`}
            className="text-xs"
            style={{ color: PALETTE.accent }}
          >
            ← Back to booking
          </Link>
        </div>
        <div className="rounded-lg border p-6" style={{ background: PALETTE.surface, borderColor: PALETTE.border }}>
          <h2 className="text-base font-semibold mb-6" style={{ color: PALETTE.text }}>
            Edit Booking
          </h2>
          <BookingEditForm booking={booking} clients={clients} brands={brands} />
        </div>
      </div>
    </>
  );
}
