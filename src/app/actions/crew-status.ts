'use server';

import { revalidatePath } from 'next/cache';
import { updateBookingCrewStatus } from '@/lib/data/quotes';
import { logAudit } from '@/lib/utils/audit';
import { emitEvent } from '@/lib/utils/events';
import { getCurrentActor } from '@/lib/utils/actor';

export async function updateCrewStatusAction(args: {
  bookingCrewId: string;
  bookingId: string;
  newStatus: string;
  oldStatus: string;
}) {
  const { bookingCrewId, bookingId, newStatus, oldStatus } = args;

  const updated = await updateBookingCrewStatus(bookingCrewId, newStatus);
  if (!updated) return { error: 'Update failed' };

  await emitEvent('crew.status_change', {
    booking_crew_id: bookingCrewId,
    booking_id: bookingId,
    from: oldStatus,
    to: newStatus,
  }, { bookingId, actor: await getCurrentActor() });

  await logAudit({
    userId: await getCurrentActor(),
    action: 'crew_status_change',
    tableName: 'atelier_booking_crew',
    recordId: bookingCrewId,
    oldValue: { status: oldStatus },
    newValue: { status: newStatus, manual: true },
  });

  revalidatePath(`/bookings/${bookingId}`);
  revalidatePath('/crew-bookings');
  revalidatePath('/crew-bookings/calendar');
  return { ok: true };
}
