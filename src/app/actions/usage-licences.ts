'use server';

import { revalidatePath } from 'next/cache';
import { addUsageLicence, removeUsageLicence } from '@/lib/data/usage-licences';
import type { UsageMedia, UsageTerritory } from '@/lib/types/database';

export async function addUsageLicenceAction(formData: FormData) {
  const bookingId = formData.get('booking_id') as string;
  const mediaRaw = formData.get('media') as string;
  const territoryRaw = formData.get('territory') as string;
  const media = mediaRaw ? mediaRaw.split(',') as UsageMedia[] : [];
  const territory = territoryRaw ? territoryRaw.split(',') as UsageTerritory[] : [];

  const result = await addUsageLicence({
    booking_id: bookingId,
    talent_id: (formData.get('talent_id') as string) || null,
    media,
    territory,
    duration_months: Number(formData.get('duration_months') || 12),
    start_date: (formData.get('start_date') as string) || null,
    end_date: (formData.get('end_date') as string) || null,
    bur_multiplier: formData.get('bur_multiplier') ? Number(formData.get('bur_multiplier')) : null,
    fee: Number(formData.get('fee') || 0),
    notes: (formData.get('notes') as string) || null,
  });

  if (!result) return { error: 'Failed to add usage licence' };

  revalidatePath(`/bookings/${bookingId}`);
  return { ok: true, id: result.id };
}

export async function removeUsageLicenceAction(id: string, bookingId: string) {
  const ok = await removeUsageLicence(id);
  if (!ok) return { error: 'Failed to remove usage licence' };

  revalidatePath(`/bookings/${bookingId}`);
  return { ok: true };
}
