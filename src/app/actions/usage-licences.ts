'use server';

import { revalidatePath, revalidateTag } from 'next/cache';
import { addUsageLicence, removeUsageLicence } from '@/lib/data/usage-licences';
import { getCurrentAppUser } from '@/lib/data/app-users';
import { logAudit } from '@/lib/utils/audit';
import { getCurrentActor } from '@/lib/utils/actor';
import type { UsageMedia, UsageTerritory } from '@/lib/types/database';

async function requireOwnerOrPartner(): Promise<{ error: string } | null> {
  const user = await getCurrentAppUser();
  if (!user || (user.role !== 'owner' && user.role !== 'partner')) {
    return { error: 'Forbidden — owner or partner role required.' };
  }
  return null;
}

export async function addUsageLicenceAction(formData: FormData) {
  const authError = await requireOwnerOrPartner();
  if (authError) return { error: authError.error };

  const bookingId = formData.get('booking_id') as string;
  const mediaRaw = formData.get('media') as string;
  const territoryRaw = formData.get('territory') as string;
  const media = mediaRaw ? mediaRaw.split(',') as UsageMedia[] : [];
  const territory = territoryRaw ? territoryRaw.split(',') as UsageTerritory[] : [];

  const input = {
    booking_id: bookingId,
    talent_id: (formData.get('talent_id') as string) || null,
    media,
    territory,
    duration_months: Number(formData.get('duration_months') || 12),
    start_date: (formData.get('start_date') as string) || null,
    end_date: (formData.get('end_date') as string) || null,
    // bur_multiplier removed from add form — was a glorified multiplier
    // helper, not a real calculator. Existing rows keep their value;
    // new rows leave it null. The DB column is retained for now to avoid
    // dropping historical data; can be removed in a follow-up migration.
    bur_multiplier: null,
    fee: Number(formData.get('fee') || 0),
    notes: (formData.get('notes') as string) || null,
  };

  const result = await addUsageLicence(input);
  if (!result) return { error: 'Failed to add usage licence' };

  await logAudit({
    userId: await getCurrentActor(),
    action: 'add_usage_licence',
    tableName: 'atelier_usage_licences',
    recordId: result.id,
    newValue: input as never,
  }).catch(() => { /* non-fatal */ });

  revalidatePath(`/bookings/${bookingId}`);
  // Usage licences affect quote totals — bust the bookings tag so every
  // detail page that recomputes the quote picks up the new line.
  revalidateTag('bookings', {});
  return { ok: true, id: result.id };
}

export async function removeUsageLicenceAction(id: string, bookingId: string) {
  const authError = await requireOwnerOrPartner();
  if (authError) return { error: authError.error };

  const ok = await removeUsageLicence(id);
  if (!ok) return { error: 'Failed to remove usage licence' };

  await logAudit({
    userId: await getCurrentActor(),
    action: 'remove_usage_licence',
    tableName: 'atelier_usage_licences',
    recordId: id,
    oldValue: { id, booking_id: bookingId } as never,
  }).catch(() => { /* non-fatal */ });

  revalidatePath(`/bookings/${bookingId}`);
  revalidateTag('bookings', {});
  return { ok: true };
}
