'use server';

import { revalidatePath } from 'next/cache';
import {
  createQuoteVersion, addFeeLine, updateFeeLine, removeFeeLine,
  addBookingTalent, removeBookingTalent, addBookingCrew, removeBookingCrew,
  type CreateFeeLineInput,
} from '@/lib/data/quotes';
import type { FeeLineType } from '@/lib/types/database';
import { computeFeeLine } from '@/lib/utils/fee-engine';
import { DEFAULT_ASF_RATE, DEFAULT_COMMISSION_RATE, SUPER_RATE_CHARGED, SUPER_RATE_PAID } from '@/lib/utils/constants';

// ============================================================
// Quote version
// ============================================================

export async function createQuoteVersionAction(bookingId: string, notes?: string) {
  const qv = await createQuoteVersion(bookingId, notes);
  if (!qv) return { error: 'Failed to create quote version' };

  revalidatePath(`/bookings/${bookingId}`);
  return { ok: true, id: qv.id, version: qv.version };
}

// ============================================================
// Fee lines
// ============================================================

/** Determine defaults based on line type */
function lineTypeDefaults(lineType: FeeLineType) {
  const artistLabour = ['artist_fee', 'usage_licence', 'file_management', 'retouching', 'post_production'];
  const crewLabour = ['crew_labour', 'overtime'];
  const isArtist = artistLabour.includes(lineType);
  const isCrew = crewLabour.includes(lineType);

  return {
    is_commissionable: isArtist,
    commission_rate: isArtist ? DEFAULT_COMMISSION_RATE : 0,
    is_super_bearing: isCrew,
    super_rate_charged: isCrew ? SUPER_RATE_CHARGED : 0,
    super_rate_paid: isCrew ? SUPER_RATE_PAID : 0,
    is_gst_exempt: false,
    asf_rate: DEFAULT_ASF_RATE,
  };
}

export async function addFeeLineAction(formData: FormData) {
  const quoteVersionId = formData.get('quote_version_id') as string;
  const bookingId = formData.get('booking_id') as string;
  const lineType = formData.get('line_type') as FeeLineType;
  const description = formData.get('description') as string;
  const quantity = Number(formData.get('quantity') || 1);
  const unitPrice = Number(formData.get('unit_price') || 0);

  const defaults = lineTypeDefaults(lineType);

  // Allow override of ASF rate from form
  const asfRateOverride = formData.get('asf_rate');
  const asfRate = asfRateOverride != null && asfRateOverride !== '' ? Number(asfRateOverride) : defaults.asf_rate;

  const subtotal = Math.round(quantity * unitPrice * 100) / 100;
  const asfAmount = Math.round(subtotal * asfRate * 100) / 100;

  const input: CreateFeeLineInput = {
    quote_version_id: quoteVersionId,
    booking_id: bookingId,
    line_type: lineType,
    description,
    quantity,
    unit_price: unitPrice,
    subtotal,
    asf_rate: asfRate,
    asf_amount: asfAmount,
    is_gst_exempt: defaults.is_gst_exempt,
    is_super_bearing: defaults.is_super_bearing,
    super_rate_charged: defaults.super_rate_charged,
    super_rate_paid: defaults.super_rate_paid,
    is_commissionable: defaults.is_commissionable,
    commission_rate: defaults.commission_rate,
    talent_id: (formData.get('talent_id') as string) || null,
    crew_id: (formData.get('crew_id') as string) || null,
    notes: (formData.get('notes') as string) || null,
  };

  const line = await addFeeLine(input);
  if (!line) return { error: 'Failed to add fee line' };

  revalidatePath(`/bookings/${bookingId}`);
  return { ok: true, id: line.id };
}

export async function updateFeeLineAction(id: string, formData: FormData) {
  const bookingId = formData.get('booking_id') as string;
  const updates: Record<string, unknown> = {};

  const desc = formData.get('description');
  if (desc != null) updates.description = desc;

  const qty = formData.get('quantity');
  if (qty != null && qty !== '') {
    updates.quantity = Number(qty);
  }

  const price = formData.get('unit_price');
  if (price != null && price !== '') {
    updates.unit_price = Number(price);
  }

  // Recompute subtotal + asf if qty or price changed
  if (updates.quantity != null || updates.unit_price != null) {
    const q = (updates.quantity as number) ?? Number(formData.get('current_quantity') || 1);
    const p = (updates.unit_price as number) ?? Number(formData.get('current_unit_price') || 0);
    updates.subtotal = Math.round(q * p * 100) / 100;

    const asfRate = Number(formData.get('asf_rate') || formData.get('current_asf_rate') || DEFAULT_ASF_RATE);
    updates.asf_rate = asfRate;
    updates.asf_amount = Math.round((updates.subtotal as number) * asfRate * 100) / 100;
  }

  const notes = formData.get('notes');
  if (notes != null) updates.notes = notes || null;

  const result = await updateFeeLine(id, updates);
  if (!result) return { error: 'Failed to update fee line' };

  revalidatePath(`/bookings/${bookingId}`);
  return { ok: true };
}

export async function removeFeeLineAction(id: string, bookingId: string) {
  const ok = await removeFeeLine(id);
  if (!ok) return { error: 'Failed to remove fee line' };

  revalidatePath(`/bookings/${bookingId}`);
  return { ok: true };
}

// ============================================================
// Booking talent + crew
// ============================================================

export async function addBookingTalentAction(formData: FormData) {
  const bookingId = formData.get('booking_id') as string;
  const talentId = formData.get('talent_id') as string;
  const role = formData.get('role_on_booking') as string;
  const dayRate = formData.get('day_rate') ? Number(formData.get('day_rate')) : null;
  const halfDayRate = formData.get('half_day_rate') ? Number(formData.get('half_day_rate')) : null;
  const usageFee = formData.get('usage_fee') ? Number(formData.get('usage_fee')) : null;

  const result = await addBookingTalent({
    booking_id: bookingId,
    talent_id: talentId,
    role_on_booking: role,
    day_rate: dayRate,
    half_day_rate: halfDayRate,
    usage_fee: usageFee,
  });

  if (!result) return { error: 'Failed to add talent to booking' };
  revalidatePath(`/bookings/${bookingId}`);
  return { ok: true };
}

export async function removeBookingTalentAction(id: string, bookingId: string) {
  const ok = await removeBookingTalent(id);
  if (!ok) return { error: 'Failed to remove talent' };
  revalidatePath(`/bookings/${bookingId}`);
  return { ok: true };
}

export async function addBookingCrewAction(formData: FormData) {
  const bookingId = formData.get('booking_id') as string;
  const crewId = formData.get('crew_id') as string;
  const role = (formData.get('role_on_booking') as string) || null;
  const dayRate = formData.get('day_rate') ? Number(formData.get('day_rate')) : null;

  const result = await addBookingCrew({
    booking_id: bookingId,
    crew_id: crewId,
    role_on_booking: role,
    day_rate: dayRate,
  });

  if (!result) return { error: 'Failed to add crew to booking' };
  revalidatePath(`/bookings/${bookingId}`);
  return { ok: true };
}

export async function removeBookingCrewAction(id: string, bookingId: string) {
  const ok = await removeBookingCrew(id);
  if (!ok) return { error: 'Failed to remove crew' };
  revalidatePath(`/bookings/${bookingId}`);
  return { ok: true };
}
