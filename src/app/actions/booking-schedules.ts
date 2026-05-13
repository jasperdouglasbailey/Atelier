'use server';

import { revalidatePath, revalidateTag } from 'next/cache';
import { createServiceClient } from '@/lib/supabase/service';
import { getCurrentAppUser } from '@/lib/data/app-users';
import type { BookingSchedule } from '@/lib/types/database';

function err(message: string) { return { ok: false as const, error: message }; }

async function requireOwnerOrPartner() {
  const user = await getCurrentAppUser();
  if (!user || (user.role !== 'owner' && user.role !== 'partner')) return null;
  return user;
}

export async function upsertScheduleAction(
  bookingId: string,
  scheduleDate: string,
  patch: Pick<BookingSchedule, 'call_time' | 'wrap_time' | 'location' | 'notes'>,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const user = await requireOwnerOrPartner();
  if (!user) return err('Not authorised');

  const supabase = createServiceClient();
  const { error } = await supabase
    .from('atelier_booking_schedules')
    .upsert(
      { booking_id: bookingId, schedule_date: scheduleDate, ...patch },
      { onConflict: 'booking_id,schedule_date' },
    );

  if (error) return err(error.message);
  revalidatePath(`/bookings/${bookingId}`);
  revalidateTag('bookings');
  return { ok: true };
}

export async function deleteScheduleAction(
  scheduleId: string,
  bookingId: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const user = await requireOwnerOrPartner();
  if (!user) return err('Not authorised');

  const supabase = createServiceClient();
  const { error } = await supabase
    .from('atelier_booking_schedules')
    .delete()
    .eq('id', scheduleId);

  if (error) return err(error.message);
  revalidatePath(`/bookings/${bookingId}`);
  revalidateTag('bookings');
  return { ok: true };
}
