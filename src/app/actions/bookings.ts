'use server';

import { revalidatePath } from 'next/cache';
import { createBooking, getBooking, updateBooking, transitionState, type CreateBookingInput } from '@/lib/data/bookings';
import { proposeHoldRequests } from '@/lib/automation/hold-requests';
import { checkKillSwitch } from '@/lib/utils/kill-switch';
import { extractBriefFields } from '@/lib/automation/brief-intake';
import { buildDateRange } from '@/lib/utils/daterange';
import type { BookingState } from '@/lib/types/database';

export async function createBookingAction(formData: FormData) {
  const shootStart = (formData.get('shoot_date_start') as string) || null;
  const shootEnd = (formData.get('shoot_date_end') as string) || null;

  const input: CreateBookingInput = {
    title: formData.get('title') as string,
    tier: formData.get('tier') as CreateBookingInput['tier'],
    client_id: (formData.get('client_id') as string) || null,
    brand_id: (formData.get('brand_id') as string) || null,
    creative_agency_id: (formData.get('creative_agency_id') as string) || null,
    shoot_location: (formData.get('shoot_location') as string) || null,
    shoot_date_notes: (formData.get('shoot_date_notes') as string) || null,
    shoot_dates: buildDateRange(shootStart, shootEnd),
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
  // Structured shoot date range
  const shootStart = formData.get('shoot_date_start') as string | null;
  const shootEnd = formData.get('shoot_date_end') as string | null;
  if (shootStart !== null || shootEnd !== null) {
    updates.shoot_dates = buildDateRange(shootStart || null, shootEnd || null);
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

  // Auto-trigger crew hold requests when quote is sent.
  // Runs deterministically — no LLM, no external call.
  // Kill switch is checked inside proposeHoldRequests; failures are logged
  // but never block the state transition itself.
  if (newState === 'quote_sent') {
    const ks = await checkKillSwitch();
    if (ks.canProceed) {
      proposeHoldRequests(id).catch((err) =>
        console.error('[transitionBookingAction] auto hold-request failed', err),
      );
    }
  }

  revalidatePath(`/bookings/${id}`);
  revalidatePath('/bookings');
  revalidatePath('/inbox');
  revalidatePath('/');
  return { ok: true };
}

// ============================================================
// Brief auto-parser
// ============================================================

/**
 * Parse the booking's raw brief text and return suggested field values.
 * Does NOT apply changes — returns suggestions for the user to review.
 */
export async function parseBriefAction(id: string) {
  const booking = await getBooking(id);
  if (!booking) return { error: 'Booking not found' };
  if (!booking.brief_raw_text) return { error: 'No raw brief text on this booking' };

  // extractBriefFields uses the heuristic parser + LLM (when API key is set)
  const suggestions = await extractBriefFields(booking.brief_raw_text, id);
  return { ok: true, suggestions };
}

/**
 * Apply parsed brief suggestions to the booking (only fields that are provided).
 * Builds the date range from the two date strings if present.
 */
export async function applyBriefSuggestionsAction(id: string, formData: FormData) {
  const updates: Record<string, unknown> = {};

  const textFields = [
    'shoot_location', 'shoot_date_notes', 'talent_spec', 'deliverables_type',
  ] as const;
  for (const f of textFields) {
    const val = formData.get(f);
    if (val !== null && val !== '') updates[f] = val;
  }

  const numFields = ['talent_count', 'deliverables_count', 'usage_duration_months', 'budget_indication'] as const;
  for (const f of numFields) {
    const val = formData.get(f);
    if (val !== null && val !== '') updates[f] = Number(val);
  }

  // Build date range from start/end strings
  const shootStart = formData.get('shoot_date_start') as string | null;
  const shootEnd = formData.get('shoot_date_end') as string | null;
  if (shootStart) {
    updates.shoot_dates = buildDateRange(shootStart, shootEnd ?? shootStart);
  }

  const result = await updateBooking(id, updates);
  if (!result) return { error: 'Failed to apply suggestions' };

  // Advance state to brief_parsed if still at brief_received
  const current = await getBooking(id);
  if (current?.state === 'brief_received') {
    await transitionState(id, 'brief_parsed');
  }

  revalidatePath(`/bookings/${id}`);
  revalidatePath('/bookings');
  return { ok: true };
}
