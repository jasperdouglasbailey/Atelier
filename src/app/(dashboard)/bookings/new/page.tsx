import Topbar from '@/components/layout/Topbar';
import BookingForm from '@/components/bookings/BookingForm';
import { listBrands } from '@/lib/data/entities';
import { getCachedActiveClients, getCachedActiveTalent } from '@/lib/data/entities-cache';
import { listLocations } from '@/lib/data/locations';

export default async function NewBookingPage() {
  const [clients, brands, talent, locations] = await Promise.all([
    getCachedActiveClients(),
    listBrands(),
    getCachedActiveTalent(),
    listLocations({ active_only: true }),
  ]);

  return (
    <>
      <Topbar title="New Booking" />
      <div className="mx-auto max-w-3xl p-4 sm:p-6">
        <BookingForm clients={clients} brands={brands} talent={talent} locations={locations} />
      </div>
    </>
  );
}
