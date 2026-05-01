import Topbar from '@/components/layout/Topbar';
import CrewCalendar from '@/components/crew-bookings/CrewCalendar';
import ViewToggle from '@/components/crew-bookings/ViewToggle';
import { getCalendarShoots } from '@/lib/data/crew-bookings';

export default async function CrewBookingsCalendarPage() {
  const shoots = await getCalendarShoots();

  return (
    <>
      <Topbar title="Crew Bookings" />
      <div className="p-4 sm:p-6">
        <div className="mb-4 flex items-center justify-between gap-3">
          <ViewToggle active="calendar" />
        </div>
        <CrewCalendar shoots={shoots} />
      </div>
    </>
  );
}
