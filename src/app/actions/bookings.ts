'use server';

import { revalidatePath } from 'next/cache';
import { createBooking, updateBooking, transitionState, type CreateBookingInput } from '@/lib/data/bookings';
import type { BookingState } from '@/lib/types/database';

export async function createBookingAction(formData: FormData) {
  const input: CreateBookingInput = {
    title: formData.get('title') as string,
    tier: formData.get('tier') as CreateBookingInput['tier'],
    client_id: (formData.get('client_id') as string) || null,
    brand_id: (formData.get('brand_id') as string) || null,
    creative_agency_id: (formData.get('creative_agency_id') as string) || null,
    shoot_location: (formData.get('shoot_location') as string) || null,
    shoot_date_notes: (formData.get('shoot_date_notes') as string) || null,
    talent_count: formData.get('talent_count') ? Number(formData.get('talent_count')) : null,
    talent_spec: (formData.get('talent_spec') as string) || null,
    deliverables_type: (formData.get('deliverables_type') as string) || null,
    deliverables_count: formData.get('deliverables_count') ? Number(formData.get('deliverables_count')) : null,
    usage_duration_months: formData.get('usage_duration_months') ? Number(formData.get('usage_duration_months')) : null,
    usage_notes: (formData.get('usage_notes') as string) || null,
    budget_indication: formData.get('budget_indication') ? Number(formData.get('budget_indication')) : null,
    agency_notes: (formData.get('agency_notes') as string) || null,
    brief_raw_text: (formData.get('brief_raw_text') as string) || null,
  };

  const booking = await createBooking(input);
  if (!booking) return { error: 'Failed to create booking' };

  revalidatePath('/bookings');
  revalidatePath('/');
  return { id: booking.id, ref: booking.booking_ref };
}

export async function updateBookingAction(id: string, formData: FormData) {
  const updates: Record<string, unknown> = {};
  const fields = [
    'title', 'shoot_location', 'shoot_date_notes', 'talent_spec',
    'deliverables_type', 'usage_notes', 'agency_notes', 'brief_raw_text',
    'selects_cadence', 'retouch_note_format', 'video_references',
    'wardrobe_responsibility',
  ];
  for (const f of fields) {
    const val = formData.get(f);
    if (val !== null) updates[f] = val || null;
  }
  const numFields = ['talent_count', 'deliverables_count', 'usage_duration_months', 'budget_indication', 'looks_per_talent'];
  for (const f of numFields) {
    const val = formData.get(f);
    if (val !== null) updates[f] = val ? Number(val) : null;
  }
  if (formData.get('tier')) updates.tier = formData.get('tier');
  if (formData.get('client_id')) updates.client_id = formData.get('client_id') || null;
  if (formData.get('brand_id')) updates.brand_id = formData.get('brand_id') || null;
  if (formData.get('post_production_ownership')) updates.post_production_ownership = formData.get('post_production_ownership') || null;

  const result = await updateBooking(id, updates);
  if (!result) return { error: 'Failed to update booking' };

  revalidatePath(`/bookings/${id}`);
  revalidatePath('/bookings');
  return { ok: true };
}

export async function transitionBookingAction(
  id: string,
  newState: BookingState,
  meta?: { reason?: string; releasedTo?: string; cancellationFee?: number },
) {
  const result = await transitionState(id, newState, meta);
  if (!result.ok) return { error: result.error };

  revalidatePath(`/bookings/${id}`);
  revalidatePath('/bookings');
  revalidatePath('/');
  return { ok: true };
}
