import Topbar from '@/components/layout/Topbar';
import BookingForm from '@/components/bookings/BookingForm';
import { listClients, listBrands } from '@/lib/data/entities';

export default async function NewBookingPage() {
  const [clients, brands] = await Promise.all([listClients(), listBrands()]);

  return (
    <>
      <Topbar title="New Booking" />
      <div className="mx-auto max-w-3xl p-4 sm:p-6">
        <BookingForm clients={clients} brands={brands} />
      </div>
    </>
  );
}
