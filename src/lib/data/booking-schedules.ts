import { createServiceClient } from '@/lib/supabase/service';
import { reportDataError } from '@/lib/utils/data-errors';
import type { BookingSchedule } from '@/lib/types/database';

const TABLE = 'atelier_booking_schedules';

export async function listBookingSchedules(bookingId: string): Promise<BookingSchedule[]> {
  const supabase = createServiceClient();
  const { data, error } = await supabase
    .from(TABLE)
    .select('*')
    .eq('booking_id', bookingId)
    .order('schedule_date', { ascending: true });

  if (error) { reportDataError('[schedules] list', error); return []; }
  return (data ?? []) as BookingSchedule[];
}
