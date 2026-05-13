'use server';

import { revalidatePath, revalidateTag } from 'next/cache';
import {
  createQuoteVersion, addFeeLine, updateFeeLine, removeFeeLine,
  addBookingTalent, removeBookingTalent, addBookingCrew, removeBookingCrew,
  listFeeLines, getFeeLine, listBookingTalent,
  type CreateFeeLineInput,
} from '@/lib/data/quotes';
import { getBooking } from '@/lib/data/bookings';
import type { FeeLineType, FeeLine } from '@/lib/types/database';
import { DEFAULT_ASF_RATE, DEFAULT_COMMISSION_RATE, SUPER_RATE_CHARGED, SUPER_RATE_PAID } from '@/lib/utils/constants';
import { TEMPLATE_LINES_MAP, type QuoteTemplate } from '@/lib/utils/quote-templates';
import { logAudit } from '@/lib/utils/audit';
import { getCurrentActor } from '@/lib/utils/actor';

/**
 * Create a new quote version pre-populated with standard template lines.
 * shootFeeOverride replaces the template's default shoot fee if the talent's
 * confirmed day rate is known.
 */
export async function generateQuoteFromTemplateAction(
  bookingId: string,
  template: QuoteTemplate,
  shootFeeOverride?: number,
) {
  const qv = await createQuoteVersion(bookingId);
  if (!qv) return { error: 'Failed to create quote version' };

  const booking = await getBooking(bookingId);
  const postProdOwnership = booking?.post_production_ownership ?? null;
  const postProdInHouse = postProdOwnership === 'us_via_artist' || postProdOwnership === 'us_via_post_team';

  const lines = TEMPLATE_LINES_MAP[template].filter((tl) => {
    // Post production line only included when we handle post-prod
    if (tl.line_type === 'post_production' && template === 'photographer' && !postProdInHouse) return false;
    return true;
  });
  for (let i = 0; i < lines.length; i++) {
    const tl = lines[i];
    const unitPrice =
      tl.line_type === 'artist_fee' && shootFeeOverride != null && shootFeeOverride > 0
        ? shootFeeOverride
        : tl.unit_price;
    const subtotal = Math.round(tl.quantity * unitPrice * 100) / 100;
    const asfAmount = Math.round(subtotal * tl.asf_rate * 100) / 100;

    await addFeeLine({
      quote_version_id: qv.id,
      booking_id: bookingId,
      line_type: tl.line_type,
      description: tl.description,
      quantity: tl.quantity,
      unit_price: unitPrice,
      subtotal,
      asf_rate: tl.asf_rate,
      asf_amount: asfAmount,
      is_gst_exempt: false,
      is_super_bearing: tl.is_super_bearing,
      super_rate_charged: tl.super_rate_charged,
      super_rate_paid: tl.super_rate_paid,
      is_commissionable: tl.is_commissionable,
      commission_rate: tl.commission_rate,
      sort_order: i,
    });
  }

  revalidatePath(`/bookings/${bookingId}`); revalidateTag('bookings', {});
  return { ok: true, id: qv.id, version: qv.version };
}

// ============================================================
// Quote version
// ============================================================

export async function createQuoteVersionAction(bookingId: string, notes?: string) {
  const qv = await createQuoteVersion(bookingId, notes);
  if (!qv) return { error: 'Failed to create quote version' };

  revalidatePath(`/bookings/${bookingId}`); revalidateTag('bookings', {});
  return { ok: true, id: qv.id, version: qv.version };
}

// ============================================================
// Fee lines
// ============================================================

const ARTIST_LABOUR_LINE_TYPES = ['artist_fee', 'usage_licence', 'file_management', 'retouching', 'post_production'];
const CREW_LABOUR_LINE_TYPES = ['crew_labour', 'overtime'];
// Pass-through costs — no ASF by default (client is reimbursing a real expenditure)
const FRINGE_LINE_TYPES = [
  'crew_equipment', 'equipment_rental', 'studio_hire', 'travel',
  'catering', 'wardrobe', 'props', 'casting', 'location_fee',
  'permits', 'insurance', 'other_expense',
];

/** Determine defaults based on line type */
function lineTypeDefaults(lineType: FeeLineType) {
  const isArtist = ARTIST_LABOUR_LINE_TYPES.includes(lineType);
  const isCrew = CREW_LABOUR_LINE_TYPES.includes(lineType);
  const isFringe = FRINGE_LINE_TYPES.includes(lineType);

  return {
    is_commissionable: isArtist,
    commission_rate: isArtist ? DEFAULT_COMMISSION_RATE : 0,
    is_super_bearing: isCrew,
    super_rate_charged: isCrew ? SUPER_RATE_CHARGED : 0,
    super_rate_paid: isCrew ? SUPER_RATE_PAID : 0,
    is_gst_exempt: false,
    // Fringe/expense lines are pass-through costs — no ASF by default
    asf_rate: isFringe ? 0 : DEFAULT_ASF_RATE,
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

  // GST exempt driven by payee's registration status (form sends 'true'/'false')
  const gstExemptOverride = formData.get('gst_exempt');
  const isGstExempt = gstExemptOverride === 'true';

  const subtotal = Math.round(quantity * unitPrice * 100) / 100;
  const asfAmount = Math.round(subtotal * asfRate * 100) / 100;

  const isArtistReimbursement = formData.get('is_artist_reimbursement') === 'true';

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
    is_gst_exempt: isGstExempt,
    is_super_bearing: defaults.is_super_bearing,
    super_rate_charged: defaults.super_rate_charged,
    super_rate_paid: defaults.super_rate_paid,
    is_commissionable: defaults.is_commissionable,
    commission_rate: defaults.commission_rate,
    talent_id: (formData.get('talent_id') as string) || null,
    crew_id: (formData.get('crew_id') as string) || null,
    notes: (formData.get('notes') as string) || null,
    is_artist_reimbursement: isArtistReimbursement,
  };

  const line = await addFeeLine(input);
  if (!line) return { error: 'Failed to add fee line' };

  await logAudit({
    userId: await getCurrentActor(),
    action: 'fee_line_add',
    tableName: 'atelier_fee_lines',
    recordId: line.id,
    newValue: { booking_id: bookingId, line_type: lineType, subtotal, asf_amount: asfAmount },
  }).catch(() => {});

  revalidatePath(`/bookings/${bookingId}`); revalidateTag('bookings', {});
  return { ok: true, id: line.id };
}

export async function updateFeeLineAction(id: string, formData: FormData) {
  const bookingId = formData.get('booking_id') as string;
  const updates: Record<string, unknown> = {};

  const lineType = formData.get('line_type') as FeeLineType | null;
  if (lineType) updates.line_type = lineType;

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

  // ASF rate can be updated independently of qty/price — Jasper toggles it
  // off for equipment / pass-through lines without touching anything else.
  const asfRateRaw = formData.get('asf_rate');
  const asfRateChanged = asfRateRaw != null && asfRateRaw !== '';
  if (asfRateChanged) {
    updates.asf_rate = Number(asfRateRaw);
  }

  // Recompute subtotal + asf_amount whenever qty, price, or asf_rate changed.
  // Pull whichever values aren't being updated from the existing row so the
  // arithmetic stays consistent.
  if (updates.quantity != null || updates.unit_price != null || asfRateChanged) {
    const existing = await getFeeLine(id);
    const q = (updates.quantity as number) ?? existing?.quantity ?? 1;
    const p = (updates.unit_price as number) ?? existing?.unit_price ?? 0;
    const r = (updates.asf_rate as number) ?? existing?.asf_rate ?? DEFAULT_ASF_RATE;
    updates.subtotal = Math.round(q * p * 100) / 100;
    updates.asf_amount = Math.round((updates.subtotal as number) * r * 100) / 100;
  }

  const notes = formData.get('notes');
  if (notes != null) updates.notes = notes || null;

  const reimbursementRaw = formData.get('is_artist_reimbursement');
  if (reimbursementRaw != null && reimbursementRaw !== '') {
    updates.is_artist_reimbursement = reimbursementRaw === 'true';
  }

  const result = await updateFeeLine(id, updates);
  if (!result) return { error: 'Failed to update fee line' };

  await logAudit({
    userId: await getCurrentActor(),
    action: 'fee_line_update',
    tableName: 'atelier_fee_lines',
    recordId: id,
    newValue: updates as never,
  }).catch(() => {});

  revalidatePath(`/bookings/${bookingId}`); revalidateTag('bookings', {});
  return { ok: true };
}

export async function removeFeeLineAction(id: string, bookingId: string) {
  const ok = await removeFeeLine(id);
  if (!ok) return { error: 'Failed to remove fee line' };

  await logAudit({
    userId: await getCurrentActor(),
    action: 'fee_line_remove',
    tableName: 'atelier_fee_lines',
    recordId: id,
    newValue: { booking_id: bookingId },
  }).catch(() => {});

  revalidatePath(`/bookings/${bookingId}`); revalidateTag('bookings', {});
  return { ok: true };
}

/** Load fee lines for any quote version (used by version navigator). */
export async function getFeeLinesByVersionAction(versionId: string): Promise<FeeLine[]> {
  return listFeeLines(versionId);
}

/** Reorder fee lines by updating sort_order for each id in the supplied array. */
export async function reorderFeeLinesAction(
  orderedIds: string[],
  bookingId: string,
): Promise<{ ok: boolean; error?: string }> {
  const { createClient } = await import('@/lib/supabase/server');
  const supabase = await createClient();

  // Assign sort_order in steps of 10 so future inserts slot in between
  const updates = orderedIds.map((id, i) => ({ id, sort_order: i * 10 }));
  const { error } = await supabase
    .from('atelier_fee_lines')
    .upsert(updates, { onConflict: 'id' });

  if (error) return { ok: false, error: error.message };

  revalidatePath(`/bookings/${bookingId}`); revalidateTag('bookings', {});
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
  revalidatePath(`/bookings/${bookingId}`); revalidateTag('bookings', {});
  return { ok: true };
}

export async function removeBookingTalentAction(id: string, bookingId: string) {
  const ok = await removeBookingTalent(id);
  if (!ok) return { error: 'Failed to remove talent' };
  revalidatePath(`/bookings/${bookingId}`); revalidateTag('bookings', {});
  return { ok: true };
}

/**
 * Substitute one talent for another on a booking.
 * Removes the old booking_talent row and adds a new one carrying the same
 * rate unless overridden. Writes an audit row linking old → new so the
 * substitution is traceable.
 */
export async function substituteTalentAction(opts: {
  bookingId: string;
  oldBookingTalentId: string;
  newTalentId: string;
  reason: string;
  dayRate?: number | null;
  usageFee?: number | null;
}): Promise<{ ok: true } | { error: string }> {
  const { bookingId, oldBookingTalentId, newTalentId, reason, dayRate, usageFee } = opts;

  // Fetch current roster to find the old row
  const roster = await listBookingTalent(bookingId);
  const oldRow = roster.find((r) => r.id === oldBookingTalentId);
  if (!oldRow) return { error: 'Talent row not found — it may have already been removed.' };
  if (oldRow.talent_id === newTalentId) return { error: 'Replacement talent is the same as the current artist.' };

  const resolvedDayRate = dayRate !== undefined ? dayRate : oldRow.day_rate;
  const resolvedUsageFee = usageFee !== undefined ? usageFee : oldRow.usage_fee;
  const role = oldRow.role_on_booking;

  // Remove old row first
  const removed = await removeBookingTalent(oldBookingTalentId);
  if (!removed) return { error: 'Failed to remove original talent — try again.' };

  // Add replacement
  const added = await addBookingTalent({
    booking_id: bookingId,
    talent_id: newTalentId,
    role_on_booking: role,
    day_rate: resolvedDayRate,
    half_day_rate: oldRow.half_day_rate,
    usage_fee: resolvedUsageFee,
  });
  if (!added) {
    // Best-effort — log the gap, don't re-add old talent (state is already mutated)
    return { error: 'Replacement talent could not be added. The original was already removed — please add the replacement manually.' };
  }

  await logAudit({
    userId: await getCurrentActor(),
    action: 'talent_substituted',
    tableName: 'atelier_bookings',
    recordId: bookingId,
    newValue: ({
      old_talent_id: oldRow.talent_id,
      new_talent_id: newTalentId,
      reason,
      day_rate: resolvedDayRate,
    } as unknown) as import('@/lib/types/database').Json,
  }).catch(() => {});

  revalidatePath(`/bookings/${bookingId}`); revalidateTag('bookings', {});
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

  if (!result.ok) {
    // Surface the specific reason — UI shows "never_again" rejections in
    // an alert with a link to the crew member's profile.
    return { error: result.error, reason: result.reason };
  }
  revalidatePath(`/bookings/${bookingId}`); revalidateTag('bookings', {});
  return { ok: true };
}

export async function removeBookingCrewAction(id: string, bookingId: string) {
  const ok = await removeBookingCrew(id);
  if (!ok) return { error: 'Failed to remove crew' };
  revalidatePath(`/bookings/${bookingId}`); revalidateTag('bookings', {});
  return { ok: true };
}

/**
 * Set per-day assignment for a crew member on a multi-day shoot.
 * Pass an empty array to mean "every day of the booking".
 * Dates must be ISO YYYY-MM-DD strings.
 */
export async function updateBookingCrewAssignedDatesAction(args: {
  bookingCrewId: string;
  bookingId: string;
  assignedDates: string[];
}) {
  const { bookingCrewId, bookingId, assignedDates } = args;

  if (!/^[0-9a-f-]{36}$/i.test(bookingCrewId)) return { error: 'Invalid id' };

  // Normalise: empty array → NULL (meaning "all days"). Drop invalid entries
  // defensively even though the picker constrains the input to shoot days.
  const cleaned = assignedDates
    .filter((d) => /^\d{4}-\d{2}-\d{2}$/.test(d))
    .sort();
  const nextValue: string[] | null = cleaned.length > 0 ? cleaned : null;

  const { createClient } = await import('@/lib/supabase/server');
  const supabase = await createClient();
  const { error } = await supabase
    .from('atelier_booking_crew')
    .update({ assigned_dates: nextValue })
    .eq('id', bookingCrewId);

  if (error) return { error: error.message };

  await logAudit({
    userId: await getCurrentActor(),
    action: 'crew_assigned_dates_update',
    tableName: 'atelier_booking_crew',
    recordId: bookingCrewId,
    newValue: { assigned_dates: nextValue },
  });

  revalidatePath(`/bookings/${bookingId}`); revalidateTag('bookings', {});
  return { ok: true };
}

// ============================================================
// OT & expense entry (morning-after window)
// ============================================================

/**
 * Add an overtime fee line to the booking's latest quote version.
 * The OT amount is pre-calculated by the client and passed in directly,
 * because computeOT depends on runtime inputs (actual hours, day rate).
 */
export async function addOTLineAction(formData: FormData) {
  const bookingId = formData.get('booking_id') as string;
  const quoteVersionId = formData.get('quote_version_id') as string;
  const description = formData.get('description') as string;
  const quantity = Number(formData.get('quantity') || 1); // hours
  const unitPrice = Number(formData.get('unit_price') || 0); // OT rate per hour
  const crewId = (formData.get('crew_id') as string) || null;

  const defaults = lineTypeDefaults('overtime');
  const subtotal = Math.round(quantity * unitPrice * 100) / 100;
  const asfAmount = Math.round(subtotal * defaults.asf_rate * 100) / 100;

  const input: CreateFeeLineInput = {
    quote_version_id: quoteVersionId,
    booking_id: bookingId,
    line_type: 'overtime',
    description,
    quantity,
    unit_price: unitPrice,
    subtotal,
    asf_rate: defaults.asf_rate,
    asf_amount: asfAmount,
    is_gst_exempt: defaults.is_gst_exempt,
    is_super_bearing: defaults.is_super_bearing,
    super_rate_charged: defaults.super_rate_charged,
    super_rate_paid: defaults.super_rate_paid,
    is_commissionable: defaults.is_commissionable,
    commission_rate: defaults.commission_rate,
    crew_id: crewId,
    notes: (formData.get('notes') as string) || null,
  };

  const line = await addFeeLine(input);
  if (!line) return { error: 'Failed to add OT line' };

  revalidatePath(`/bookings/${bookingId}`); revalidateTag('bookings', {});
  return { ok: true, id: line.id };
}

/**
 * Add a production expense fee line (catering, travel, props, etc.)
 * during the morning-after OT/expenses window.
 */
export async function addExpenseLineAction(formData: FormData) {
  const bookingId = formData.get('booking_id') as string;
  const quoteVersionId = formData.get('quote_version_id') as string;
  const lineType = formData.get('line_type') as FeeLineType;
  const description = formData.get('description') as string;
  const amount = Number(formData.get('amount') || 0);

  // Expenses typically have no ASF unless explicitly specified
  const asfRate = 0;
  const asfAmount = 0;

  const input: CreateFeeLineInput = {
    quote_version_id: quoteVersionId,
    booking_id: bookingId,
    line_type: lineType,
    description,
    quantity: 1,
    unit_price: amount,
    subtotal: amount,
    asf_rate: asfRate,
    asf_amount: asfAmount,
    is_gst_exempt: false,
    is_super_bearing: false,
    super_rate_charged: 0,
    super_rate_paid: 0,
    is_commissionable: false,
    commission_rate: 0,
    notes: (formData.get('notes') as string) || null,
  };

  const line = await addFeeLine(input);
  if (!line) return { error: 'Failed to add expense line' };

  revalidatePath(`/bookings/${bookingId}`); revalidateTag('bookings', {});
  return { ok: true, id: line.id };
}
