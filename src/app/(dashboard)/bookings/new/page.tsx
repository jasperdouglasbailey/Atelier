import Topbar from '@/components/layout/Topbar';
import BookingForm from '@/components/bookings/BookingForm';
import {
  getCachedActiveClients,
  getCachedActiveTalent,
  getCachedActiveLocations,
} from '@/lib/data/entities-cache';

export default async function NewBookingPage() {
  // All three reads are cached for 120s + revalidate by the 'entities' tag
  // when any of clients/talent/locations mutates. End Brand was dropped
  // with migration 0071 — the form no longer needs a brands roster.
  const [clients, talent, locations] = await Promise.all([
    getCachedActiveClients(),
    getCachedActiveTalent(),
    getCachedActiveLocations(),
  ]);

  return (
    <>
      <Topbar title="New Booking" />
      <div className="mx-auto max-w-3xl p-4 sm:p-6">
        <BookingForm clients={clients} talent={talent} locations={locations} />
      </div>
    </>
  );
}
