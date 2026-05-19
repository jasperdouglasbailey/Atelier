import Topbar from '@/components/layout/Topbar';
import BookingForm from '@/components/bookings/BookingForm';
import {
  getCachedActiveClients,
  getCachedActiveTalent,
  getCachedBrands,
  getCachedActiveLocations,
} from '@/lib/data/entities-cache';

export default async function NewBookingPage() {
  // All four reads are cached for 120s + revalidate by the 'entities' tag
  // when any of clients/brands/talent/locations mutates. Drops the new-
  // booking cold render from ~10s to <2s on warm caches.
  const [clients, brands, talent, locations] = await Promise.all([
    getCachedActiveClients(),
    getCachedBrands(),
    getCachedActiveTalent(),
    getCachedActiveLocations(),
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
