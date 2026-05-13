'use server';

/**
 * Portal-facing server actions.
 *
 * Every action here is scoped to the authenticated portal user — talent can
 * only touch their own booking_talent rows, crew can only touch their own
 * booking_crew rows and unavailability records. We enforce this by:
 *   1. Calling getCurrentAppUser() to get the session user + their entity ID.
 *   2. Fetching the target row and confirming it belongs to that entity.
 *   3. Using the service client for the write so RLS never blocks us after
 *      we've done the ownership check ourselves.
 */

import { revalidatePath } from 'next/cache';
import { createServiceClient } from '@/lib/supabase/service';
import { getCurrentAppUser } from '@/lib/data/app-users';
import { logAudit } from '@/lib/utils/audit';

// ─── helpers ──────────────────────────────────────────────────────────────────

function err(msg: string): { ok: false; error: string } {
  return { ok: false, error: msg };
}

// ─── crew hold: confirm or decline ───────────────────────────────────────────

export async function respondToCrewHoldAction(
  bookingCrewId: string,
  response: 'confirmed' | 'declined',
): Promise<{ ok: true } | { ok: false; error: string }> {
  const user = await getCurrentAppUser();
  if (!user || user.role !== 'crew' || !user.crew_id) return err('Not authorised');

  const supabase = createServiceClient();

  // Ownership check
  const { data: row } = await supabase
    .from('atelier_booking_crew')
    .select('id, crew_id, booking_id, status')
    .eq('id', bookingCrewId)
    .maybeSingle();

  if (!row) return err('Hold not found');
  if (row.crew_id !== user.crew_id) return err('Not authorised');
  if (!['hold_requested', 'sent'].includes(row.status)) {
    return err(`Hold is already ${row.status}`);
  }

  const newStatus = response === 'confirmed' ? 'confirmed' : 'declined';
  const { error } = await supabase
    .from('atelier_booking_crew')
    .update({
      status: newStatus,
      confirmed: response === 'confirmed',
      confirmed_at: response === 'confirmed' ? new Date().toISOString() : null,
      // Once confirmed, the hold sunset is moot. Decline keeps the row but
      // also clears expiry since the hold is no longer active.
      hold_expires_at: null,
    })
    .eq('id', bookingCrewId);

  if (error) return err(error.message);

  await logAudit({
    userId: user.user_id,
    action: `crew_hold_${response}`,
    tableName: 'atelier_booking_crew',
    recordId: bookingCrewId,
    oldValue: { status: row.status } as unknown as import('@/lib/types/database').Json,
    newValue: { status: newStatus } as unknown as import('@/lib/types/database').Json,
  }).catch(() => {});

  revalidatePath('/portal/crew');
  return { ok: true };
}

// ─── talent hold: confirm or decline ─────────────────────────────────────────

export async function respondToTalentHoldAction(
  bookingTalentId: string,
  response: 'confirmed' | 'declined',
): Promise<{ ok: true } | { ok: false; error: string }> {
  const user = await getCurrentAppUser();
  if (!user || user.role !== 'talent' || !user.talent_id) return err('Not authorised');

  const supabase = createServiceClient();

  const { data: row } = await supabase
    .from('atelier_booking_talent')
    .select('id, talent_id, booking_id, status')
    .eq('id', bookingTalentId)
    .maybeSingle();

  if (!row) return err('Hold not found');
  if (row.talent_id !== user.talent_id) return err('Not authorised');
  if (!['hold_requested', 'sent'].includes(row.status as string)) {
    return err(`Hold is already ${row.status}`);
  }

  const newStatus = response === 'confirmed' ? 'confirmed' : 'declined';
  const { error } = await supabase
    .from('atelier_booking_talent')
    .update({
      status: newStatus,
      confirmed: response === 'confirmed',
      confirmed_at: response === 'confirmed' ? new Date().toISOString() : null,
      hold_expires_at: null,
    })
    .eq('id', bookingTalentId);

  if (error) return err(error.message);

  await logAudit({
    userId: user.user_id,
    action: `talent_hold_${response}`,
    tableName: 'atelier_booking_talent',
    recordId: bookingTalentId,
    oldValue: { status: row.status } as unknown as import('@/lib/types/database').Json,
    newValue: { status: newStatus } as unknown as import('@/lib/types/database').Json,
  }).catch(() => {});

  revalidatePath('/portal/talent');
  return { ok: true };
}

// ─── talent rate acceptance ───────────────────────────────────────────────────

export async function acceptTalentRateAction(
  bookingTalentId: string,
): Promise<void> {
  const user = await getCurrentAppUser();
  if (!user || user.role !== 'talent' || !user.talent_id) return;

  const supabase = createServiceClient();

  const { data: row } = await supabase
    .from('atelier_booking_talent')
    .select('id, talent_id, booking_id, day_rate, rate_accepted')
    .eq('id', bookingTalentId)
    .maybeSingle();

  if (!row || row.talent_id !== user.talent_id || row.rate_accepted) return;

  const { error } = await supabase
    .from('atelier_booking_talent')
    .update({ rate_accepted: true, rate_accepted_at: new Date().toISOString() })
    .eq('id', bookingTalentId);

  if (error) throw new Error(error.message);

  await logAudit({
    userId: user.user_id,
    action: 'talent_rate_accepted',
    tableName: 'atelier_booking_talent',
    recordId: bookingTalentId,
    newValue: { day_rate: row.day_rate } as unknown as import('@/lib/types/database').Json,
  }).catch(() => {});

  revalidatePath('/portal/talent');
}

// ─── talent brief acknowledgement ────────────────────────────────────────────

export async function acknowledgeBriefAction(
  bookingTalentId: string,
): Promise<void> {
  const user = await getCurrentAppUser();
  if (!user || user.role !== 'talent' || !user.talent_id) return;

  const supabase = createServiceClient();

  const { data: row } = await supabase
    .from('atelier_booking_talent')
    .select('id, talent_id, booking_id, brief_acknowledged_at')
    .eq('id', bookingTalentId)
    .maybeSingle();

  if (!row || row.talent_id !== user.talent_id || row.brief_acknowledged_at) return;

  const { error } = await supabase
    .from('atelier_booking_talent')
    .update({ brief_acknowledged_at: new Date().toISOString() })
    .eq('id', bookingTalentId);

  if (error) throw new Error(error.message);

  await logAudit({
    userId: user.user_id,
    action: 'talent_brief_acknowledged',
    tableName: 'atelier_booking_talent',
    recordId: bookingTalentId,
    newValue: { booking_id: row.booking_id } as unknown as import('@/lib/types/database').Json,
  }).catch(() => {});

  revalidatePath('/portal/talent');
}

// ─── crew unavailability ──────────────────────────────────────────────────────

export async function addCrewUnavailabilityAction(
  dateFrom: string,
  dateTo: string,
  reason: string | null,
): Promise<{ ok: true; id: string } | { ok: false; error: string }> {
  const user = await getCurrentAppUser();
  if (!user || user.role !== 'crew' || !user.crew_id) return err('Not authorised');

  if (dateTo < dateFrom) return err('End date must be on or after start date');

  const supabase = createServiceClient();
  const { data, error } = await supabase
    .from('atelier_crew_unavailability')
    .insert({ crew_id: user.crew_id, date_from: dateFrom, date_to: dateTo, reason: reason || null })
    .select('id')
    .single();

  if (error) return err(error.message);

  revalidatePath('/portal/crew');
  return { ok: true, id: data.id };
}

export async function removeCrewUnavailabilityAction(
  unavailabilityId: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const user = await getCurrentAppUser();
  if (!user || user.role !== 'crew' || !user.crew_id) return err('Not authorised');

  const supabase = createServiceClient();

  // Ownership check
  const { data: row } = await supabase
    .from('atelier_crew_unavailability')
    .select('id, crew_id')
    .eq('id', unavailabilityId)
    .maybeSingle();

  if (!row) return err('Record not found');
  if (row.crew_id !== user.crew_id) return err('Not authorised');

  const { error } = await supabase
    .from('atelier_crew_unavailability')
    .delete()
    .eq('id', unavailabilityId);

  if (error) return err(error.message);

  revalidatePath('/portal/crew');
  return { ok: true };
}
// ─── talent unavailability ────────────────────────────────────────────────────

export async function addTalentUnavailabilityAction(
  dateFrom: string,
  dateTo: string,
  reason: string | null,
): Promise<{ ok: true; id: string } | { ok: false; error: string }> {
  const user = await getCurrentAppUser();
  if (!user || user.role !== 'talent' || !user.talent_id) return err('Not authorised');

  if (dateTo < dateFrom) return err('End date must be on or after start date');

  const supabase = createServiceClient();
  const { data, error } = await supabase
    .from('atelier_talent_unavailability')
    .insert({ talent_id: user.talent_id, date_from: dateFrom, date_to: dateTo, reason: reason || null })
    .select('id')
    .single();

  if (error) return err(error.message);

  revalidatePath('/portal/talent');
  return { ok: true, id: data.id as string };
}

export async function removeTalentUnavailabilityAction(
  unavailabilityId: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const user = await getCurrentAppUser();
  if (!user || user.role !== 'talent' || !user.talent_id) return err('Not authorised');

  const supabase = createServiceClient();

  const { data: row } = await supabase
    .from('atelier_talent_unavailability')
    .select('id, talent_id')
    .eq('id', unavailabilityId)
    .maybeSingle();

  if (!row) return err('Record not found');
  if (row.talent_id !== user.talent_id) return err('Not authorised');

  const { error } = await supabase
    .from('atelier_talent_unavailability')
    .delete()
    .eq('id', unavailabilityId);

  if (error) return err(error.message);

  revalidatePath('/portal/talent');
  return { ok: true };
}
