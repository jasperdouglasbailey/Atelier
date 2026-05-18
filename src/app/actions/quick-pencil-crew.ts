'use server';

import { revalidatePath, revalidateTag } from 'next/cache';
import { createClient } from '@/lib/supabase/server';
import { getCurrentAppUser } from '@/lib/data/app-users';
import { getCurrentActor } from '@/lib/utils/actor';
import { logAudit } from '@/lib/utils/audit';
import { listBookingCrew, listBookingTalent } from '@/lib/data/quotes';
import { listPreferredCrew, type TalentPreferredCrewRow } from '@/lib/data/talent-preferred-crew';
import { proposeHoldRequests } from '@/lib/automation/hold-requests';

/**
 * Pick the top preferred crew member per role_hint, ordered by sort_order
 * (ascending — lower = higher priority). When two rows share a role_hint,
 * the one with the smaller sort_order wins. Rows with a null role_hint
 * are NOT considered — they have no automatic intent, the operator has
 * to pick those manually.
 *
 * Filtering pipeline:
 *   1. Drop rows with null role_hint (no auto-assign target)
 *   2. Drop rows pointing at crew not joined or inactive
 *   3. Drop `never_again` crew — they're tagged as do-not-book
 *   4. Drop crew already on the booking (avoid duplicates)
 *   5. Group remaining rows by role_hint, take first (lowest sort_order)
 */
function pickPreferredByRole(
  preferred: TalentPreferredCrewRow[],
  existingCrewIds: Set<string>,
): TalentPreferredCrewRow[] {
  const seenRoles = new Set<string>();
  const picks: TalentPreferredCrewRow[] = [];
  // listPreferredCrew already orders by sort_order ASC; we just walk it.
  for (const row of preferred) {
    if (!row.role_hint) continue;
    if (!row.crew) continue;
    if (row.crew.is_active === false) continue;
    if (row.crew.tier === 'never_again') continue;
    if (existingCrewIds.has(row.crew_id)) continue;
    if (seenRoles.has(row.role_hint)) continue;
    seenRoles.add(row.role_hint);
    picks.push(row);
  }
  return picks;
}

export type QuickPencilResult =
  | { ok: true; pencilled: Array<{ crew_id: string; name: string; role_hint: string }>; emailsDrafted: number }
  | { ok: false; error: string };

/**
 * "Quick pencil preferred crew" — given a booking with a primary talent
 * set, this action:
 *
 *   1. Reads the talent's preferred crew list
 *   2. Picks the top entry per role_hint (top digital_operator, top
 *      first_assistant, etc.) ordered by sort_order
 *   3. Filters out crew already on the booking and `never_again` tier
 *   4. Inserts `atelier_booking_crew` rows with status='hold_requested'
 *      and a 14-day hold expiry — matches how the existing crew picker
 *      writes pencilled rows, but flips status so the hold-request
 *      automation picks them up immediately
 *   5. Calls proposeHoldRequests() so each newly-pencilled crew member
 *      gets a templated email drafted for Jasper's approval
 *
 * Idempotent in the "no duplicates" sense — calling twice when all
 * preferred crew are already booked is a no-op. Audit logged per call.
 */
export async function quickPencilPreferredCrewAction(
  bookingId: string,
): Promise<QuickPencilResult> {
  const user = await getCurrentAppUser();
  if (!user || (user.role !== 'owner' && user.role !== 'partner')) {
    return { ok: false, error: 'Forbidden — only owner/partner can pencil crew.' };
  }

  // Identify the primary talent on the booking
  const bookingTalent = await listBookingTalent(bookingId);
  const primaryTalentId = bookingTalent[0]?.talent_id ?? null;
  if (!primaryTalentId) {
    return { ok: false, error: 'No primary talent on this booking yet — add one before pencilling crew.' };
  }

  // Read the preferred crew + currently-booked crew in parallel
  const [preferred, existingCrew] = await Promise.all([
    listPreferredCrew(primaryTalentId),
    listBookingCrew(bookingId),
  ]);

  const existingCrewIds = new Set(existingCrew.map((bc) => bc.crew_id));
  const picks = pickPreferredByRole(preferred, existingCrewIds);

  if (picks.length === 0) {
    return {
      ok: false,
      error: preferred.length === 0
        ? "This artist has no preferred crew set up yet. Add some on their profile first."
        : 'No new preferred crew to pencil — they may already be on this booking or have no role_hint set.',
    };
  }

  // Insert as hold_requested with the same 14-day expiry the manual
  // picker uses. Single insert call so partial failures don't leave a
  // half-committed pencil — if anything fails, nothing gets created.
  const holdExpiresAt = new Date(Date.now() + 14 * 24 * 60 * 60 * 1000).toISOString();
  const rows = picks.map((p) => ({
    booking_id: bookingId,
    crew_id: p.crew_id,
    role_on_booking: p.role_hint,
    day_rate: p.crew?.default_day_rate ?? null,
    notes: p.notes,
    status: 'hold_requested' as const,
    hold_expires_at: holdExpiresAt,
  }));

  const supabase = await createClient();
  const { error: insertErr } = await supabase
    .from('atelier_booking_crew')
    .insert(rows);

  if (insertErr) {
    return { ok: false, error: insertErr.message };
  }

  // Audit log a single summary row — keeps the trail readable when
  // pencilling 2-3 crew at once.
  await logAudit({
    userId: await getCurrentActor(),
    action: 'quick_pencil_preferred_crew',
    tableName: 'atelier_booking_crew',
    recordId: bookingId,
    newValue: {
      talent_id: primaryTalentId,
      pencilled: picks.map((p) => ({
        crew_id: p.crew_id,
        name: p.crew?.name ?? null,
        role_hint: p.role_hint,
        sort_order: p.sort_order,
      })),
    },
  }).catch(() => { /* non-fatal */ });

  // Kick the hold-request automation — drafts a templated email per
  // newly-pencilled crew member for Jasper's approval queue.
  let emailsDrafted = 0;
  try {
    const result = await proposeHoldRequests(bookingId);
    emailsDrafted = result.created;
  } catch (err) {
    console.error('[quickPencilPreferredCrew] proposeHoldRequests failed', err);
    // Non-fatal: the booking_crew rows are still there, Jasper can
    // retry the propose step manually from the existing trigger.
  }

  revalidatePath(`/bookings/${bookingId}`);
  revalidateTag('bookings', {});

  return {
    ok: true,
    pencilled: picks.map((p) => ({
      crew_id: p.crew_id,
      name: p.crew?.name ?? 'Unknown',
      role_hint: p.role_hint!,
    })),
    emailsDrafted,
  };
}
