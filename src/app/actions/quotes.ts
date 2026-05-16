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
import { getCurrentAppUser } from '@/lib/data/app-users';
import { reportDataError } from '@/lib/utils/data-errors';

/**
 * Guard for fee-line mutations. Surfaces a clear "Not authorised" instead
 * of letting the action hit Supabase and get back an opaque RLS denial.
 * Returns null when the user is allowed.
 */
async function requireOwnerOrPartner(): Promise<{ error: string } | null> {
  const user = await getCurrentAppUser();
  if (!user) return { error: 'Not signed in' };
  if (user.role !== 'owner' && user.role !== 'partner') {
    return { error: `Not authorised to modify fee lines (role: ${user.role})` };
  }
  return null;
}

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

// =================================================================
// Canonical fee-engine rules — see CLAUDE.md "Fee model rules" block.
// =================================================================
// Artist labour — commissionable (20%), ASF default on, no super.
// Includes artist_travel (artist's paid travel time) but NOT plain
// `travel` which is crew/production travel and is not commissionable.
const ARTIST_LABOUR_LINE_TYPES = ['artist_fee', 'usage_licence', 'file_management', 'retouching', 'post_production', 'artist_overtime', 'artist_travel'];
// Super-bearing — ONLY crew_labour (the day rate). Crew overtime,
// crew equipment, crew travel, crew expenses do NOT bear super.
const SUPER_BEARING_LINE_TYPES = ['crew_labour'];

/** True when a line type is commissionable — these can never be reimbursable. */
function isCommissionableType(t: FeeLineType): boolean {
  return ARTIST_LABOUR_LINE_TYPES.includes(t);
}

/** ASF defaults to 15% on every line type — the agency adds margin on
 * labour AND production expenses. Toggleable per line for genuine
 * pass-through cases. */
function lineTypeDefaults(lineType: FeeLineType) {
  const isArtist = ARTIST_LABOUR_LINE_TYPES.includes(lineType);
  const bearsSupervalue = SUPER_BEARING_LINE_TYPES.includes(lineType);

  return {
    is_commissionable: isArtist,
    commission_rate: isArtist ? DEFAULT_COMMISSION_RATE : 0,
    is_super_bearing: bearsSupervalue,
    super_rate_charged: bearsSupervalue ? SUPER_RATE_CHARGED : 0,
    super_rate_paid: bearsSupervalue ? SUPER_RATE_PAID : 0,
    is_gst_exempt: false,
    asf_rate: DEFAULT_ASF_RATE,
  };
}

export async function addFeeLineAction(formData: FormData) {
  const authError = await requireOwnerOrPartner();
  if (authError) return authError;
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

  // Optional actual-cost override. Stored as cost_subtotal; null means
  // cost = billed (the historical default).
  const costSubtotalRaw = formData.get('cost_subtotal');
  const costSubtotal = costSubtotalRaw != null && costSubtotalRaw !== ''
    ? Math.round(Number(costSubtotalRaw) * 100) / 100
    : null;

  // Commissionable lines (artist labour) can never be reimbursable — the
  // agency takes commission off them, they're not a pass-through expense.
  const isArtistReimbursement = !isCommissionableType(lineType)
    && formData.get('is_artist_reimbursement') === 'true';

  const input: CreateFeeLineInput = {
    quote_version_id: quoteVersionId,
    booking_id: bookingId,
    line_type: lineType,
    description,
    quantity,
    unit_price: unitPrice,
    subtotal,
    cost_subtotal: costSubtotal,
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
  if (!line) return { ok: false as const, error: 'Failed to add fee line — likely RLS denial or invalid input. Check server logs.' };

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

type ActionResult = { ok: true } | { ok: false; error: string };

export async function updateFeeLineAction(id: string, formData: FormData): Promise<ActionResult> {
  const authError = await requireOwnerOrPartner();
  if (authError) return { ok: false, error: authError.error };
  const bookingId = formData.get('booking_id') as string;
  if (!id) return { ok: false, error: 'Missing fee line id' };
  if (!bookingId) return { ok: false, error: 'Missing booking_id' };

  const updates: Record<string, unknown> = {};

  const lineType = formData.get('line_type') as FeeLineType | null;
  if (lineType) updates.line_type = lineType;

  const desc = formData.get('description');
  if (desc != null) updates.description = desc;

  const qty = formData.get('quantity');
  if (qty != null && qty !== '') {
    const n = Number(qty);
    if (!Number.isFinite(n) || n < 0) return { ok: false, error: `Invalid quantity "${qty}"` };
    updates.quantity = n;
  }

  const price = formData.get('unit_price');
  if (price != null && price !== '') {
    const n = Number(price);
    if (!Number.isFinite(n) || n < 0) return { ok: false, error: `Invalid unit price "${price}"` };
    updates.unit_price = n;
  }

  // ASF rate can be updated independently of qty/price — Jasper toggles it
  // off for equipment / pass-through lines without touching anything else.
  const asfRateRaw = formData.get('asf_rate');
  const asfRateChanged = asfRateRaw != null && asfRateRaw !== '';
  if (asfRateChanged) {
    const n = Number(asfRateRaw);
    if (!Number.isFinite(n) || n < 0 || n > 1) return { ok: false, error: `Invalid ASF rate "${asfRateRaw}" (expected 0–1)` };
    updates.asf_rate = n;
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

  // Optional cost_subtotal override. Empty string / missing = clear (null = cost
  // equals billed). Number = explicit cost amount.
  const costSubtotalRaw = formData.get('cost_subtotal');
  if (costSubtotalRaw != null) {
    if (costSubtotalRaw === '') {
      updates.cost_subtotal = null;
    } else {
      const n = Number(costSubtotalRaw);
      if (!Number.isFinite(n) || n < 0) return { ok: false, error: `Invalid cost subtotal "${costSubtotalRaw}"` };
      updates.cost_subtotal = Math.round(n * 100) / 100;
    }
  }

  const notes = formData.get('notes');
  if (notes != null) updates.notes = notes || null;

  const reimbursementRaw = formData.get('is_artist_reimbursement');
  if (reimbursementRaw != null && reimbursementRaw !== '') {
    // Commissionable lines can never be reimbursable. If the line is being
    // changed to a commissionable type in this update (or it already is),
    // force the flag off — even if the client submitted it as true.
    const effectiveType = (lineType ?? (await getFeeLine(id))?.line_type) as FeeLineType | undefined;
    const commissionable = effectiveType ? isCommissionableType(effectiveType) : false;
    updates.is_artist_reimbursement = !commissionable && reimbursementRaw === 'true';
  } else if (lineType && isCommissionableType(lineType)) {
    // Type changed to a commissionable type and no explicit reimbursement
    // flag in the payload — still clear the existing flag so a previously
    // reimbursable non-artist line doesn't carry the flag into an artist type.
    updates.is_artist_reimbursement = false;
  }

  const result = await updateFeeLine(id, updates);
  if (!result.ok) return { ok: false, error: result.error };

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

export async function removeFeeLineAction(id: string, bookingId: string): Promise<ActionResult> {
  const authError = await requireOwnerOrPartner();
  if (authError) return { ok: false, error: authError.error };
  const ok = await removeFeeLine(id);
  if (!ok) return { ok: false, error: 'Failed to remove fee line — likely RLS denial or already deleted' };

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

/**
 * Recreate a deleted fee line from a client-cached snapshot. Powers the
 * 8s toast undo in QuoteBuilder after a delete. New ID is fine — fee
 * lines have no stable external references that depend on it.
 *
 * Takes the same input shape as the data-layer `addFeeLine` so the
 * client can pass back exactly what it had cached before the delete.
 */
export async function restoreFeeLineAction(input: {
  quote_version_id: string;
  booking_id: string;
  line_type: FeeLineType;
  description: string;
  talent_id?: string | null;
  crew_id?: string | null;
  quantity: number;
  unit_price: number;
  asf_rate: number;
  is_gst_exempt: boolean;
  notes?: string | null;
  is_artist_reimbursement?: boolean;
  sort_order?: number;
}): Promise<{ ok: true; id: string } | { ok: false; error: string }> {
  const authError = await requireOwnerOrPartner();
  if (authError) return { ok: false, error: authError.error };

  const defaults = lineTypeDefaults(input.line_type);
  const subtotal = Math.round(input.quantity * input.unit_price * 100) / 100;
  const asfAmount = Math.round(subtotal * input.asf_rate * 100) / 100;
  const isArtistReimbursement = !isCommissionableType(input.line_type)
    && Boolean(input.is_artist_reimbursement);

  const line = await addFeeLine({
    quote_version_id: input.quote_version_id,
    booking_id: input.booking_id,
    line_type: input.line_type,
    description: input.description,
    talent_id: input.talent_id ?? null,
    crew_id: input.crew_id ?? null,
    quantity: input.quantity,
    unit_price: input.unit_price,
    subtotal,
    asf_rate: input.asf_rate,
    asf_amount: asfAmount,
    is_gst_exempt: input.is_gst_exempt,
    is_super_bearing: defaults.is_super_bearing,
    super_rate_charged: defaults.super_rate_charged,
    super_rate_paid: defaults.super_rate_paid,
    is_commissionable: defaults.is_commissionable,
    commission_rate: defaults.commission_rate,
    notes: input.notes ?? null,
    is_artist_reimbursement: isArtistReimbursement,
    sort_order: input.sort_order,
  });

  if (!line) return { ok: false, error: 'Failed to restore fee line — likely RLS denial or invalid input.' };

  await logAudit({
    userId: await getCurrentActor(),
    action: 'fee_line_restore',
    tableName: 'atelier_fee_lines',
    recordId: line.id,
    newValue: { booking_id: input.booking_id, line_type: input.line_type, restored: true },
  }).catch(() => {});

  revalidatePath(`/bookings/${input.booking_id}`); revalidateTag('bookings', {});
  return { ok: true, id: line.id };
}

/** Load fee lines for any quote version (used by version navigator). */
export async function getFeeLinesByVersionAction(versionId: string): Promise<FeeLine[]> {
  return listFeeLines(versionId);
}

/**
 * Reorder fee lines by updating sort_order for each id in the supplied array.
 *
 * Reported by Jasper 2026-05-15 — dragging a fee line to a new position
 * sometimes didn't persist (item snapped back after refresh). The previous
 * implementation used `.upsert(updates, { onConflict: 'id' })` which is
 * unreliable for partial-column writes — PostgREST validates the INSERT
 * side of ON CONFLICT against NOT NULL columns even when every row exists,
 * so a payload of just `{ id, sort_order }` can be rejected silently.
 *
 * Fix: individual UPDATEs, one per row. N round-trips for N rows but for a
 * quote with ~10 fee lines that's well under 200ms. Each update returns an
 * error if it fails, so a real failure surfaces to the user instead of
 * silently letting the order snap back.
 */
export async function reorderFeeLinesAction(
  orderedIds: string[],
  bookingId: string,
): Promise<{ ok: boolean; error?: string }> {
  const authError = await requireOwnerOrPartner();
  if (authError) return { ok: false, error: authError.error };
  if (orderedIds.length === 0) return { ok: true };

  const { createServiceClient } = await import('@/lib/supabase/service');
  const supabase = createServiceClient();

  // Assign sort_order in steps of 10 so future inserts slot in between.
  // Parallel UPDATEs — each row's sort_order changes independently.
  const results = await Promise.all(
    orderedIds.map((id, i) =>
      supabase
        .from('atelier_fee_lines')
        .update({ sort_order: i * 10 })
        .eq('id', id)
        .select('id, sort_order')
        .single(),
    ),
  );

  // Surface the first failure with full Supabase context so the client can
  // show the operator what's wrong instead of silently reverting.
  for (let i = 0; i < results.length; i++) {
    const r = results[i];
    if (r.error) {
      const msg = `Reorder failed at position ${i} (id ${orderedIds[i]}): ${r.error.message}`
        + (r.error.code ? ` · code ${r.error.code}` : '')
        + (r.error.details ? ` · ${r.error.details}` : '');
      reportDataError('[reorderFeeLines]', r.error);
      return { ok: false, error: msg };
    }
  }

  await logAudit({
    userId: await getCurrentActor(),
    action: 'fee_line_reorder',
    tableName: 'atelier_fee_lines',
    recordId: bookingId,
    newValue: { count: orderedIds.length, orderedIds } as unknown as import('@/lib/types/database').Json,
  }).catch(() => {});

  revalidatePath(`/bookings/${bookingId}`);
  revalidateTag('bookings', {});
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

/**
 * Update the hold-expiry sunset on a booking_talent or booking_crew row.
 * `expiresAt` of null clears the hold; otherwise an ISO timestamp.
 */
export async function updateHoldExpiryAction(args: {
  tableKind: 'talent' | 'crew';
  id: string;
  bookingId: string;
  expiresAt: string | null;
}) {
  const { tableKind, id, bookingId, expiresAt } = args;
  if (!/^[0-9a-f-]{36}$/i.test(id)) return { error: 'Invalid id' };
  if (tableKind !== 'talent' && tableKind !== 'crew') return { error: 'Invalid table kind' };

  const { updateHoldExpiry } = await import('@/lib/data/quotes');
  const ok = await updateHoldExpiry(tableKind, id, expiresAt);
  if (!ok) return { error: 'Failed to update hold expiry' };

  await logAudit({
    userId: await getCurrentActor(),
    action: `${tableKind === 'talent' ? 'booking_talent' : 'booking_crew'}_hold_expiry_update`,
    tableName: tableKind === 'talent' ? 'atelier_booking_talent' : 'atelier_booking_crew',
    recordId: id,
    newValue: { hold_expires_at: expiresAt },
  });

  revalidatePath(`/bookings/${bookingId}`); revalidateTag('bookings', {});
  return { ok: true };
}

/**
 * Set a per-day rate override for a single crew assignment. Passing
 * `rate = null` removes the override (date falls back to row-level day_rate).
 */
export async function updateCrewDayRateOverrideAction(args: {
  bookingCrewId: string;
  bookingId: string;
  date: string;
  rate: number | null;
}) {
  const { bookingCrewId, bookingId, date, rate } = args;
  if (!/^[0-9a-f-]{36}$/i.test(bookingCrewId)) return { error: 'Invalid id' };
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return { error: 'Invalid date' };
  if (rate !== null && (!Number.isFinite(rate) || rate < 0)) return { error: 'Invalid rate' };

  const { updateCrewDayRateOverride } = await import('@/lib/data/quotes');
  const ok = await updateCrewDayRateOverride(bookingCrewId, date, rate);
  if (!ok) return { error: 'Failed to update rate override' };

  await logAudit({
    userId: await getCurrentActor(),
    action: 'crew_day_rate_override_update',
    tableName: 'atelier_booking_crew',
    recordId: bookingCrewId,
    newValue: { date, rate },
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
