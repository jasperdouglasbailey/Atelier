'use server';

import { revalidatePath, revalidateTag } from 'next/cache';
import { reportDataError } from '@/lib/utils/data-errors';
import { createBooking, getBooking, updateBooking, transitionState, deleteBookingWithCorpus, type CreateBookingInput } from '@/lib/data/bookings';
import { createQuoteVersion, addFeeLine, listQuoteVersions, listBookingTalent, listBookingCrew } from '@/lib/data/quotes';
import { TEMPLATE_LINES_MAP } from '@/lib/utils/quote-templates';
import { proposeHoldRequests } from '@/lib/automation/hold-requests';
import { checkKillSwitch } from '@/lib/utils/kill-switch';
import { extractBriefFields } from '@/lib/automation/brief-intake';
import { autoQueueBriefClarifyIfNeeded } from '@/lib/automation/brief-clarify';
import { mapTerritoryRaw, mapMediaRaw } from '@/lib/utils/brief-parser';
import { buildDateRange } from '@/lib/utils/daterange';
import { createBookingFolders, createSharedLink } from '@/lib/integrations/drive';
import { createCalendarEvent, updateCalendarEvent, deleteCalendarEvent } from '@/lib/integrations/calendar';
import { sendEmail, draftEmail } from '@/lib/integrations/gmail';
import { isGoogleConfigured } from '@/lib/integrations/google-auth';
import { getAgencyConfig } from '@/lib/utils/agency-config';
import { callLLM } from '@/lib/integrations/anthropic';
import { critiqueDraft, jasperVoicePromptBlock } from '@/lib/automation/agent-primitives';
import { buildRemittanceEmail } from '@/lib/utils/comms-tone';
import { dateRangeToInputs } from '@/lib/utils/daterange';
import { createClient as createSupabaseServer } from '@/lib/supabase/server';
import { logAudit, logAuditFailure } from '@/lib/utils/audit';
import { getCurrentActor } from '@/lib/utils/actor';
import { getCurrentAppUser } from '@/lib/data/app-users';
import type { BookingState } from '@/lib/types/database';

/**
 * Build Quote V1 from a discipline template. Used by both create-booking flow
 * (when a primary artist is set) and the manual "Regenerate Quote V1" button
 * for legacy bookings that didn't have an artist when first created.
 *
 * Pure server-side helper — no FormData, no revalidation. Caller decides
 * what to revalidate.
 *
 * Returns the new quote_version id, or null if the booking already has lines
 * (we never overwrite manual work).
 */
async function generateQuoteV1FromTemplate(
  bookingId: string,
  discipline: 'photographer' | 'videographer',
  defaultDayRate: number | null,
): Promise<string | null> {
  const qv = await createQuoteVersion(bookingId);
  if (!qv) return null;

  const lines = TEMPLATE_LINES_MAP[discipline];
  const shootFeeOverride = defaultDayRate != null && defaultDayRate > 0 ? defaultDayRate : null;

  for (let i = 0; i < lines.length; i++) {
    const tl = lines[i];
    const unitPrice = tl.line_type === 'artist_fee' && shootFeeOverride != null
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
  return qv.id;
}

export async function createBookingAction(formData: FormData) {
  const shootStart = (formData.get('shoot_date_start') as string) || null;
  const shootEnd = (formData.get('shoot_date_end') as string) || null;

  // Parse usage arrays from JSON (serialised by BookingForm)
  let usageMedia: string[] | null = null;
  let usageTerritory: string[] | null = null;
  const mediaRaw = formData.get('usage_media');
  if (mediaRaw) { try { usageMedia = JSON.parse(mediaRaw as string); } catch { usageMedia = []; } }
  const territoryRaw = formData.get('usage_territory');
  if (territoryRaw) { try { usageTerritory = JSON.parse(territoryRaw as string); } catch { usageTerritory = []; } }

  const input: CreateBookingInput = {
    title: formData.get('title') as string,
    tier: formData.get('tier') as CreateBookingInput['tier'],
    client_id: (formData.get('client_id') as string) || null,
    brand_id: (formData.get('brand_id') as string) || null,
    creative_agency_id: (formData.get('creative_agency_id') as string) || null,
    shoot_location: (formData.get('shoot_location') as string) || null,
    shoot_date_notes: (formData.get('shoot_date_notes') as string) || null,
    shoot_dates: buildDateRange(shootStart, shootEnd),
    call_time: (formData.get('call_time') as string) || null,
    wrap_time: (formData.get('wrap_time') as string) || null,
    talent_count: formData.get('talent_count') ? Number(formData.get('talent_count')) : null,
    deliverables_type: (formData.get('deliverables_type') as string) || null,
    deliverables_count: formData.get('deliverables_count') ? Number(formData.get('deliverables_count')) : null,
    usage_duration_months: formData.get('usage_duration_months') ? Number(formData.get('usage_duration_months')) : null,
    usage_notes: (formData.get('usage_notes') as string) || null,
    post_production_ownership: (formData.get('post_production_ownership') as string) || null,
    agency_notes: (formData.get('agency_notes') as string) || null,
    brief_raw_text: (formData.get('brief_raw_text') as string) || null,
    usage_media: usageMedia,
    usage_territory: usageTerritory,
    producer_name: (formData.get('producer_name') as string) || null,
    producer_email: (formData.get('producer_email') as string) || null,
    producer_phone: (formData.get('producer_phone') as string) || null,
    confirmation_deadline: (formData.get('confirmation_deadline') as string) || null,
  };

  const booking = await createBooking(input);
  if (!booking) {
    await logAuditFailure({
      userId: await getCurrentActor(),
      action: 'create_booking',
      tableName: 'atelier_bookings',
      attempted: ({ title: input.title, tier: input.tier, client_id: input.client_id } as unknown) as import('@/lib/types/database').Json,
      error: 'createBooking returned null (see server log for Supabase error detail)',
    });
    return { error: 'Failed to create booking' };
  }

  // Link the primary artist immediately so the booking shows the artist on creation.
  // Role defaults to the artist's discipline (e.g. "photographer").
  const primaryTalentId = (formData.get('primary_talent_id') as string) || null;
  const discipline = (formData.get('primary_talent_discipline') as string) || '';

  if (primaryTalentId) {
    const supabase = await createSupabaseServer();

    // Get talent's default day rate to pre-fill the shoot fee
    const { data: talentRow } = await supabase
      .from('atelier_talent')
      .select('default_day_rate')
      .eq('id', primaryTalentId)
      .single();

    await supabase.from('atelier_booking_talent').insert({
      booking_id: booking.id,
      talent_id: primaryTalentId,
      role_on_booking: discipline || 'photographer',
      day_rate: talentRow?.default_day_rate ?? null,
      confirmed: false,
    });

    // Auto-generate Quote V1 from the artist's discipline template.
    if (discipline === 'photographer' || discipline === 'videographer') {
      await generateQuoteV1FromTemplate(booking.id, discipline, talentRow?.default_day_rate ?? null);
    }
  }

  revalidatePath('/bookings');
  revalidatePath('/');
  revalidateTag('bookings', {});
  return { id: booking.id, ref: booking.booking_ref };
}

export async function updateBookingAction(id: string, formData: FormData) {
  const updates: Record<string, unknown> = {};
  const fields = [
    'title', 'shoot_location', 'shoot_date_notes',
    'call_time', 'wrap_time',
    'deliverables_type', 'agency_notes', 'brief_raw_text',
    'selects_cadence',
    'producer_name', 'producer_email', 'producer_phone',
    'confirmation_deadline',
    'po_number', 'job_number',
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
  if (formData.get('post_production_ownership') !== null) updates.post_production_ownership = formData.get('post_production_ownership') || null;

  // Array fields arrive as JSON strings from the edit form
  const mediaRaw = formData.get('usage_media');
  if (mediaRaw !== null) {
    try { updates.usage_media = JSON.parse(mediaRaw as string); } catch { updates.usage_media = []; }
  }
  const territoryRaw = formData.get('usage_territory');
  if (territoryRaw !== null) {
    try { updates.usage_territory = JSON.parse(territoryRaw as string); } catch { updates.usage_territory = []; }
  }

  const result = await updateBooking(id, updates);
  if (!result) {
    await logAuditFailure({
      userId: await getCurrentActor(),
      action: 'update_booking',
      tableName: 'atelier_bookings',
      recordId: id,
      attempted: (updates as unknown) as import('@/lib/types/database').Json,
      error: 'updateBooking returned null (see server log for Supabase error detail)',
    });
    return { error: 'Failed to update booking' };
  }

  // Primary artist swap: when the edit form changed the primary_talent_id we
  // replace the existing booking_talent row(s) with the new artist. This is a
  // destructive op (loses confirmation status / day rate edits on the old
  // record) — the form warns the user before submitting.
  const primaryChanged = formData.get('primary_talent_changed') === '1';
  const newPrimaryId = (formData.get('primary_talent_id') as string) || null;
  const newDiscipline = (formData.get('primary_talent_discipline') as string) || '';

  if (primaryChanged && newPrimaryId) {
    const supabase = await createSupabaseServer();
    // Pull new artist's default day rate so the booking_talent row is sensible
    const { data: talentRow } = await supabase
      .from('atelier_talent')
      .select('default_day_rate')
      .eq('id', newPrimaryId)
      .single();

    // Remove existing rows then insert one for the new artist
    await supabase.from('atelier_booking_talent').delete().eq('booking_id', id);
    await supabase.from('atelier_booking_talent').insert({
      booking_id: id,
      talent_id: newPrimaryId,
      role_on_booking: newDiscipline || 'photographer',
      day_rate: talentRow?.default_day_rate ?? null,
      confirmed: false,
    });
  }

  // Calendar sync — if shoot dates, location, or call/wrap time changed AND a
  // calendar event already exists, push the update.
  const calendarTriggerFields = ['shoot_dates', 'shoot_location', 'call_time', 'wrap_time'];
  if (calendarTriggerFields.some((f) => f in updates)) {
    const refreshed = await getBooking(id);
    if (refreshed?.calendar_event_id) {
      const { start, end } = dateRangeToInputs(refreshed.shoot_dates);
      if (start) {
        const callWrapDesc = refreshed.call_time
          ? `Call: ${refreshed.call_time}${refreshed.wrap_time ? ` · Wrap: ${refreshed.wrap_time}` : ''}`
          : null;
        updateCalendarEvent(refreshed.calendar_event_id, {
          startDate: start,
          endDate: end || start,
          location: refreshed.shoot_location ?? undefined,
          description: callWrapDesc ?? undefined,
        }).catch((err) =>
          reportDataError('[updateBookingAction] Calendar event update failed', err),
        );
      }
    }
  }

  // Schedule auto-populate: when shoot_dates changes, ensure each new date has at
  // least a skeleton schedule row so the call sheet has something to populate.
  // Existing rows are never deleted — only missing dates are inserted.
  if (updates.shoot_dates) {
    const { start, end } = dateRangeToInputs(updates.shoot_dates as string);
    if (start) {
      const supabase = await createSupabaseServer();
      const dates: string[] = [];
      const cur = new Date(start + 'T00:00:00Z');
      const endDate = new Date((end || start) + 'T00:00:00Z');
      while (cur <= endDate) {
        dates.push(cur.toISOString().slice(0, 10));
        cur.setUTCDate(cur.getUTCDate() + 1);
      }
      if (dates.length > 0 && dates.length <= 60) {
        try {
          await supabase.from('atelier_booking_schedules').upsert(
            dates.map((d) => ({ booking_id: id, schedule_date: d })),
            { onConflict: 'booking_id,schedule_date', ignoreDuplicates: true },
          );
        } catch (err) {
          reportDataError('[updateBookingAction] schedule upsert failed', err);
        }
      }
    }
  }

  revalidatePath(`/bookings/${id}`);
  revalidatePath('/bookings');
  revalidateTag('bookings', {});
  return { ok: true };
}

/**
 * Field-level inline edit on the booking detail page. One column, one save.
 *
 * The whitelist below is the single source of truth for which fields can be
 * edited inline (and what type they are). Anything else needs to go through
 * `/bookings/[id]/edit` — that page is still the fallback for fields that
 * don't fit a one-input UX (primary artist swap, usage media/territory
 * arrays, etc.).
 *
 * For the date range we expose a separate action below because the range
 * is two inputs (start + end) that need to be saved together.
 */
const INLINE_TEXT_FIELDS = new Set([
  'title',
  'shoot_location',
  'shoot_date_notes',
  'call_time',
  'wrap_time',
  'deliverables_type',
  'agency_notes',
  'selects_cadence',
  'producer_name',
  'producer_email',
  'producer_phone',
  'post_production_ownership',
  'grade_retouch_scope',
  'tier',
] as const);

const INLINE_NUMERIC_FIELDS = new Set([
  'deliverables_count',
  'looks_per_talent',
] as const);

const INLINE_DATE_FIELDS = new Set([
  'confirmation_deadline',
] as const);

const CALENDAR_TRIGGER_FIELDS = new Set([
  'shoot_dates', 'shoot_location', 'call_time', 'wrap_time',
]);

async function syncCalendarIfNeeded(id: string, changedField: string) {
  if (!CALENDAR_TRIGGER_FIELDS.has(changedField)) return;
  const refreshed = await getBooking(id);
  if (!refreshed?.calendar_event_id) return;
  const { start, end } = dateRangeToInputs(refreshed.shoot_dates);
  if (!start) return;
  const callWrapDesc = refreshed.call_time
    ? `Call: ${refreshed.call_time}${refreshed.wrap_time ? ` · Wrap: ${refreshed.wrap_time}` : ''}`
    : null;
  await updateCalendarEvent(refreshed.calendar_event_id, {
    startDate: start,
    endDate: end || start,
    location: refreshed.shoot_location ?? undefined,
    description: callWrapDesc ?? undefined,
  }).catch((err) =>
    reportDataError('[updateBookingFieldAction] Calendar event update failed', err),
  );
}

export async function updateBookingFieldAction(
  id: string,
  field: string,
  value: string | null,
) {
  const isText = INLINE_TEXT_FIELDS.has(field as never);
  const isNumeric = INLINE_NUMERIC_FIELDS.has(field as never);
  const isDate = INLINE_DATE_FIELDS.has(field as never);
  if (!isText && !isNumeric && !isDate) {
    return { error: `Field "${field}" is not editable inline` };
  }

  const trimmed = value == null ? null : value.trim() === '' ? null : value.trim();
  let parsed: string | number | null = trimmed;
  if (isNumeric && trimmed !== null) {
    const n = Number(trimmed);
    if (!Number.isFinite(n)) return { error: 'Must be a number' };
    parsed = n;
  }

  const result = await updateBooking(id, { [field]: parsed });
  if (!result) {
    await logAuditFailure({
      userId: await getCurrentActor(),
      action: 'update_booking_field',
      tableName: 'atelier_bookings',
      recordId: id,
      attempted: { field, value: parsed } as import('@/lib/types/database').Json,
      error: 'updateBooking returned null',
    });
    return { error: 'Failed to save' };
  }

  await syncCalendarIfNeeded(id, field);

  revalidatePath(`/bookings/${id}`);
  revalidatePath('/bookings');
  revalidateTag('bookings', {});
  return { ok: true };
}

export async function updateBookingShootDatesAction(
  id: string,
  start: string | null,
  end: string | null,
) {
  const trimmedStart = start && start.trim() !== '' ? start.trim() : null;
  const trimmedEnd = end && end.trim() !== '' ? end.trim() : null;
  const range = buildDateRange(trimmedStart, trimmedEnd);

  const result = await updateBooking(id, { shoot_dates: range });
  if (!result) {
    await logAuditFailure({
      userId: await getCurrentActor(),
      action: 'update_booking_field',
      tableName: 'atelier_bookings',
      recordId: id,
      attempted: { field: 'shoot_dates', start: trimmedStart, end: trimmedEnd } as import('@/lib/types/database').Json,
      error: 'updateBooking returned null',
    });
    return { error: 'Failed to save' };
  }

  await syncCalendarIfNeeded(id, 'shoot_dates');

  revalidatePath(`/bookings/${id}`);
  revalidatePath('/bookings');
  revalidateTag('bookings', {});
  return { ok: true };
}

export async function transitionBookingAction(
  id: string,
  newState: BookingState,
  meta?: { reason?: string; releasedTo?: string; cancellationFee?: number },
) {
  const result = await transitionState(id, newState, meta);
  if (!result.ok) {
    await logAuditFailure({
      userId: await getCurrentActor(),
      action: 'transition_booking',
      tableName: 'atelier_bookings',
      recordId: id,
      attempted: ({ newState, meta } as unknown) as import('@/lib/types/database').Json,
      error: result.error,
    });
    return { error: result.error };
  }

  // Auto-trigger crew hold requests when quote is sent.
  // Runs deterministically — no LLM, no external call.
  // Kill switch is checked inside proposeHoldRequests; failures are logged
  // but never block the state transition itself.
  if (newState === 'quote_sent') {
    const ks = await checkKillSwitch();
    if (ks.canProceed) {
      try {
        await proposeHoldRequests(id);
        revalidatePath(`/bookings/${id}`);
        revalidatePath('/inbox');
      } catch (err) {
        reportDataError('[transitionBookingAction] auto hold-request failed', err);
        await logAudit({
          userId: await getCurrentActor(),
          action: 'propose_holds_failed',
          tableName: 'atelier_bookings',
          recordId: id,
          newValue: { error: String(err) } as unknown as import('@/lib/types/database').Json,
        }).catch(() => {});
      }
    }
  }

  // On quote_confirmed: create Drive folders + Calendar event, both async.
  // Neither blocks the state transition itself.
  if (newState === 'quote_confirmed') {
    const booking = await getBooking(id);
    if (booking) {
      const year = new Date().getFullYear();

      // Drive folders
      if (booking.booking_ref) {
        createBookingFolders(booking.booking_ref, year)
          .then(async (driveIds) => {
            if (!driveIds) return;
            await updateBooking(id, {
              drive_root_id: driveIds.root_id,
              drive_folder_ids: driveIds.folder_ids,
              drive_root_link: driveIds.root_link,
            });
            // Folder links surface on the booking detail page; bust the cache
            // so Jasper's next view picks them up without a manual reload.
            revalidatePath(`/bookings/${id}`);
          })
          .catch((err) => reportDataError('[transitionBookingAction] Drive folder creation failed', err));
      }

      // Auto-draft confirmation email to client — always a draft (never auto-sent).
      // Async, never blocks the state transition.
      if (isGoogleConfigured() && booking.client?.email) {
        const clientName = booking.client.company || booking.client.name || '';
        const confirmBody = buildConfirmationEmailHtml({
          bookingRef: booking.booking_ref ?? '',
          title: booking.title,
          clientName,
          tier: booking.tier,
          grandTotal: booking.grand_total ?? 0,
          shootDates: booking.shoot_date_notes ?? null,
          shootLocation: booking.shoot_location ?? null,
        });
        draftEmail({
          to: [booking.client.email],
          subject: `[${booking.booking_ref ?? id.slice(0, 8)}] Booking Confirmed — ${booking.title}`,
          body: confirmBody,
          bookingRef: booking.booking_ref ?? undefined,
        }).catch((err) =>
          reportDataError('[transitionBookingAction] confirmation email draft failed', err),
        );
      }

      // Calendar event — only if shoot dates are known
      const { start, end } = dateRangeToInputs(booking.shoot_dates);
      if (start) {
        const clientName = (booking as { client?: { name: string; company?: string | null } | null }).client?.company
          ?? (booking as { client?: { name: string; company?: string | null } | null }).client?.name;
        const subject = [booking.booking_ref, booking.title, clientName].filter(Boolean).join(' — ');

        // Resolve attendee emails from the booking's roster — talent + crew
        // who have an email on file get a Google Calendar invite (works
        // for both Google and Apple Calendar users; Apple Mail parses
        // Google's invite format natively).
        const attendees: Array<{ email: string; displayName: string }> = [];
        const supabase = await createSupabaseServer();
        const [{ data: btRows }, { data: bcRows }] = await Promise.all([
          supabase
            .from('atelier_booking_talent')
            .select('talent:atelier_talent(working_name, email)')
            .eq('booking_id', id),
          supabase
            .from('atelier_booking_crew')
            .select('crew:atelier_crew(name, email)')
            .eq('booking_id', id),
        ]);
        for (const row of (btRows ?? []) as Array<{ talent: { working_name?: string; email?: string } | null }>) {
          const t = row.talent;
          if (t?.email) attendees.push({ email: t.email, displayName: t.working_name ?? t.email });
        }
        for (const row of (bcRows ?? []) as Array<{ crew: { name?: string; email?: string } | null }>) {
          const c = row.crew;
          if (c?.email) attendees.push({ email: c.email, displayName: c.name ?? c.email });
        }

        const primaryArtistName = attendees.find(() => true)?.displayName ?? null;
        const callWrap = booking.call_time ? `Call: ${booking.call_time}${booking.wrap_time ? ` · Wrap: ${booking.wrap_time}` : ''}` : null;
        createCalendarEvent({
          subject,
          startDate: start,
          endDate: end || start,
          location: booking.shoot_location ?? undefined,
          description: [
            primaryArtistName ? `Artist: ${primaryArtistName}` : '',
            attendees.length > 1 ? `+${attendees.length - 1} crew` : '',
            callWrap ?? '',
          ].filter(Boolean).join('\n'),
          bookingRef: booking.booking_ref ?? undefined,
          attendees,
        })
          .then(async (result) => {
            if (!result) return;
            await updateBooking(id, { calendar_event_id: result.eventId });
            // calendar_event_id is read on the booking detail page to render
            // the Calendar link affordance; bust cache so it shows up
            revalidatePath(`/bookings/${id}`);
          })
          .catch((err) => reportDataError('[transitionBookingAction] Calendar event creation failed', err));
      }
    }
  }

  // On release or cancel: remove the calendar event so Jasper's calendar stays clean.
  if (newState === 'released' || newState === 'cancelled') {
    const booking = await getBooking(id);
    if (booking?.calendar_event_id) {
      deleteCalendarEvent(booking.calendar_event_id).catch((err) =>
        reportDataError('[transitionBookingAction] Calendar event deletion failed', err),
      );
    }
  }

  // On final_delivery: create a shared client-delivery link for the Finals folder.
  if (newState === 'final_delivery') {
    const booking = await getBooking(id);
    const finalsId = (booking?.drive_folder_ids as { finals?: string } | null)?.finals;
    if (finalsId) {
      createSharedLink(finalsId)
        .then(async (link) => {
          if (!link) return;
          // Persist the Finals shared link in agency_notes as a reference until
          // we have a dedicated delivery_link column.
          const existingNotes = booking?.agency_notes ?? '';
          const noteEntry = `[Drive Finals] ${link}`;
          if (!existingNotes.includes(noteEntry)) {
            await updateBooking(id, {
              agency_notes: existingNotes ? `${existingNotes}\n${noteEntry}` : noteEntry,
            });
            revalidatePath(`/bookings/${id}`);
          }
        })
        .catch((err) => reportDataError('[transitionBookingAction] Drive shared link failed', err));
    }
  }

  revalidatePath(`/bookings/${id}`);
  revalidatePath('/bookings');
  revalidateTag('bookings', {});
  revalidatePath('/inbox');
  revalidatePath('/');
  revalidateTag('bookings', {});
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

  // Auto-trigger: if the parse came back with low confidence (<70),
  // queue an approval-gated clarifying email so Jasper doesn't have to
  // remember to chase. Fire-and-forget — never blocks the response.
  // Idempotent on `brief_clarify_auto_{bookingId}` so re-parses don't
  // duplicate the approval.
  void autoQueueBriefClarifyIfNeeded(id, suggestions).catch((err) => {
    console.error('[parseBriefAction] auto-queue clarify failed', err);
  });

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

  // Media and territory: try to map to structured enum values first.
  // Anything that maps confidently sets the enum array directly.
  // Anything left over (unrecognised tokens) falls into usage_notes as a hint
  // for Jasper, but we never overwrite existing notes.
  const mediaRaw = formData.get('usage_media_raw') as string | null;
  const territoryRaw = formData.get('usage_territory_raw') as string | null;
  if (mediaRaw || territoryRaw) {
    const territoryMap = mapTerritoryRaw(territoryRaw);
    const mediaMap = mapMediaRaw(mediaRaw);

    if (territoryMap.matched.length > 0) updates.usage_territory = territoryMap.matched;
    if (mediaMap.matched.length > 0) updates.usage_media = mediaMap.matched;

    // Only the tokens we couldn't map become notes — keeps the field readable.
    const residue: string[] = [];
    if (territoryMap.unmatched.length > 0) residue.push(`Territory (unmapped): ${territoryMap.unmatched.join(', ')}`);
    if (mediaMap.unmatched.length > 0) residue.push(`Media (unmapped): ${mediaMap.unmatched.join(', ')}`);

    if (residue.length > 0) {
      const existing = await getBooking(id);
      const existingNotes = existing?.usage_notes ?? null;
      updates.usage_notes = existingNotes ? `${existingNotes}\n${residue.join('\n')}` : residue.join('\n');
    }
  }

  // ─── Structured usage taxonomy (migration 0059) ───────────────────
  // Persist the LLM-extracted enum + array fields directly. Validated
  // server-side against the same allowlists baked into the DB CHECK
  // constraints — silent skip on unknown values keeps the action lenient
  // (the LLM occasionally hallucinates a synonym; we'd rather drop it
  // than throw the whole apply).
  const MARKET_VALUES = new Set(['consumer', 'trade', 'editorial']);
  const REALM_VALUES = new Set(['advertising', 'promotional', 'pr', 'corporate', 'editorial']);
  const CATEGORY_VALUES = new Set(['online', 'broadcast', 'print', 'outdoor', 'ambient']);

  const market = formData.get('usage_market') as string | null;
  if (market && MARKET_VALUES.has(market)) updates.usage_market = market;

  const realm = formData.get('usage_realm') as string | null;
  if (realm && REALM_VALUES.has(realm)) updates.usage_realm = realm;

  // Arrays come in as comma-separated strings (FormData has no list shape).
  const categoriesRaw = formData.get('usage_media_categories') as string | null;
  if (categoriesRaw) {
    const cleaned = categoriesRaw.split(',').map((s) => s.trim()).filter((s) => CATEGORY_VALUES.has(s));
    if (cleaned.length > 0) updates.usage_media_categories = cleaned;
  }

  const channelsRaw = formData.get('usage_specific_channels') as string | null;
  if (channelsRaw) {
    const cleaned = channelsRaw.split(',').map((s) => s.trim()).filter((s) => /^[a-z][a-z0-9_]*$/.test(s));
    if (cleaned.length > 0) updates.usage_specific_channels = cleaned;
  }

  const territoryIsoRaw = formData.get('usage_territory_iso') as string | null;
  if (territoryIsoRaw) {
    const cleaned = territoryIsoRaw.split(',').map((s) => s.trim().toUpperCase()).filter((s) => /^[A-Z]{2,8}$/.test(s));
    if (cleaned.length > 0) updates.usage_territory_iso = cleaned;
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
  revalidateTag('bookings', {});
  return { ok: true };
}

// ============================================================
// Send quote to client
// ============================================================

function formatCurrencyAU(n: number): string {
  return n.toLocaleString('en-AU', { style: 'currency', currency: 'AUD', minimumFractionDigits: 2 });
}

function buildQuoteEmailHtml(opts: {
  bookingRef: string;
  title: string;
  clientName: string;
  tier: string;
  grandTotal: number;
  shootDates: string | null;
  quoteUrl?: string;
}): string {
  const lines: string[] = [
    `<p>Hi ${opts.clientName || 'there'},</p>`,
    `<p>Please find our quote for <strong>${opts.title}</strong> (${opts.bookingRef}) below.</p>`,
    '<table style="border-collapse:collapse;margin:16px 0;font-size:14px">',
    `  <tr><td style="padding:4px 12px 4px 0;color:#666">Project</td><td style="padding:4px 0"><strong>${opts.title}</strong></td></tr>`,
    `  <tr><td style="padding:4px 12px 4px 0;color:#666">Reference</td><td style="padding:4px 0">${opts.bookingRef}</td></tr>`,
    `  <tr><td style="padding:4px 12px 4px 0;color:#666">Tier</td><td style="padding:4px 0">${opts.tier}</td></tr>`,
  ];
  if (opts.shootDates) {
    lines.push(`  <tr><td style="padding:4px 12px 4px 0;color:#666">Shoot</td><td style="padding:4px 0">${opts.shootDates}</td></tr>`);
  }
  if (opts.grandTotal > 0) {
    lines.push(`  <tr><td style="padding:8px 12px 4px 0;color:#666;font-weight:600">Total (inc. GST)</td><td style="padding:8px 0;font-weight:600;font-size:16px">${formatCurrencyAU(opts.grandTotal)}</td></tr>`);
  }
  lines.push('</table>');
  if (opts.quoteUrl) {
    lines.push(
      `<p style="margin:20px 0"><a href="${opts.quoteUrl}" style="display:inline-block;padding:10px 20px;background:#1a1a1a;color:#fff;text-decoration:none;border-radius:4px;font-size:13px;font-weight:600">View Full Quote</a></p>`,
    );
  }
  lines.push('<p>To confirm, please reply to this email. We\'ll hold the dates and issue paperwork once we hear from you.</p>');
  const agency = getAgencyConfig();
  const agencyNameSafe = agency.name.replace(/&/g, '&amp;');
  const signoffParts = [
    agency.ownerName,
    agencyNameSafe,
    agency.email ? `<a href="mailto:${agency.email}">${agency.email}</a>` : null,
  ].filter(Boolean);
  lines.push(`<p style="margin-top:24px">${signoffParts.join('<br>')}</p>`);
  if (opts.quoteUrl) {
    lines.push(`<p style="margin-top:16px;font-size:11px;color:#999">Quote link: <a href="${opts.quoteUrl}" style="color:#999">${opts.quoteUrl}</a></p>`);
  }
  return lines.join('\n');
}

function buildConfirmationEmailHtml(opts: {
  bookingRef: string;
  title: string;
  clientName: string;
  tier: string;
  grandTotal: number;
  shootDates: string | null;
  shootLocation: string | null;
}): string {
  const lines: string[] = [
    `<p>Hi ${opts.clientName || 'there'},</p>`,
    `<p>Wonderful — we're confirmed for <strong>${opts.title}</strong> (${opts.bookingRef}). We have the dates locked in and will be in touch shortly with paperwork.</p>`,
    '<table style="border-collapse:collapse;margin:16px 0;font-size:14px">',
    `  <tr><td style="padding:4px 12px 4px 0;color:#666">Project</td><td style="padding:4px 0"><strong>${opts.title}</strong></td></tr>`,
    `  <tr><td style="padding:4px 12px 4px 0;color:#666">Reference</td><td style="padding:4px 0">${opts.bookingRef}</td></tr>`,
  ];
  if (opts.shootDates) {
    lines.push(`  <tr><td style="padding:4px 12px 4px 0;color:#666">Shoot</td><td style="padding:4px 0">${opts.shootDates}</td></tr>`);
  }
  if (opts.shootLocation) {
    lines.push(`  <tr><td style="padding:4px 12px 4px 0;color:#666">Location</td><td style="padding:4px 0">${opts.shootLocation}</td></tr>`);
  }
  if (opts.grandTotal > 0) {
    lines.push(`  <tr><td style="padding:8px 12px 4px 0;color:#666;font-weight:600">Total (inc. GST)</td><td style="padding:8px 0;font-weight:600">${formatCurrencyAU(opts.grandTotal)}</td></tr>`);
  }
  lines.push('</table>');
  lines.push('<p>We\'ll send through the production brief and talent hold paperwork in the coming days. Please don\'t hesitate to reach out in the meantime.</p>');
  const agency = getAgencyConfig();
  const agencyNameSafe = agency.name.replace(/&/g, '&amp;');
  const signoffParts = [
    agency.ownerName,
    agencyNameSafe,
    agency.email ? `<a href="mailto:${agency.email}">${agency.email}</a>` : null,
  ].filter(Boolean);
  lines.push(`<p style="margin-top:24px">${signoffParts.join('<br>')}</p>`);
  return lines.join('\n');
}

/**
 * Send or draft a quote email to the booking's client.
 * mode='draft' creates a Gmail draft for Jasper to review; mode='send' sends immediately.
 * Transitions state quote_drafted → quote_sent on a successful send.
 */
export async function sendQuoteEmailAction(
  bookingId: string,
  mode: 'draft' | 'send' = 'draft',
  overrides?: { to?: string; subject?: string; body?: string },
) {
  const booking = await getBooking(bookingId);
  if (!booking) return { error: 'Booking not found' };

  const toEmail = overrides?.to ?? booking.client?.email ?? null;
  if (!toEmail) return { error: 'No client email address. Add one on the client profile first.' };

  const clientName = booking.client?.company || booking.client?.name || '';
  const defaultSubject = `[${booking.booking_ref ?? bookingId.slice(0, 8)}] Quote — ${booking.title}`;
  const subject = overrides?.subject ?? defaultSubject;

  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? 'https://atelier.saundersandco.com.au';
  const quoteUrl = booking.quote_token ? `${appUrl}/q/${booking.quote_token}` : undefined;

  const body = overrides?.body ?? buildQuoteEmailHtml({
    bookingRef: booking.booking_ref ?? '',
    title: booking.title,
    clientName,
    tier: booking.tier,
    grandTotal: booking.grand_total ?? 0,
    shootDates: booking.shoot_date_notes ?? null,
    quoteUrl,
  });

  if (!isGoogleConfigured()) {
    return { ok: true, mode: 'no_google' as const, to: toEmail, subject, body };
  }

  // Kill switch — respect pause_outbound for direct sends.
  // Drafts are always allowed (they don't go anywhere without Jasper hitting Send).
  if (mode === 'send') {
    const ks = await checkKillSwitch();
    if (!ks.canSendOutbound) {
      return { ok: false as const, error: `Outbound email is paused (kill switch: ${ks.level}). Switch to Draft or lift the pause in Settings → Kill Switch.` };
    }
  }

  if (mode === 'send') {
    // Wrap the send so a Gmail token expiry / network error doesn't leave
    // the booking transitioned to quote_sent with no email actually out.
    let result;
    try {
      result = await sendEmail({ to: [toEmail], subject, body, bookingRef: booking.booking_ref ?? undefined });
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Gmail send failed';
      await logAuditFailure({
        userId: await getCurrentActor(),
        action: 'send_quote_email',
        tableName: 'atelier_bookings',
        recordId: bookingId,
        error: msg,
      }).catch(() => {});
      return { ok: false as const, error: `Failed to send email: ${msg}. The booking state was not changed.` };
    }
    if (booking.state === 'quote_drafted') {
      await transitionState(bookingId, 'quote_sent');
    }
    revalidatePath(`/bookings/${bookingId}`);
    revalidatePath('/bookings');
  revalidateTag('bookings', {});
    return { ok: true, mode: 'sent' as const, messageId: result.messageId };
  } else {
    try {
      const result = await draftEmail({ to: [toEmail], subject, body, bookingRef: booking.booking_ref ?? undefined });
      revalidatePath(`/bookings/${bookingId}`);
      return { ok: true, mode: 'drafted' as const, draftId: result.draftId };
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Gmail draft failed';
      await logAuditFailure({
        userId: await getCurrentActor(),
        action: 'draft_quote_email',
        tableName: 'atelier_bookings',
        recordId: bookingId,
        error: msg,
      }).catch(() => {});
      return { ok: false as const, error: `Failed to create draft: ${msg}` };
    }
  }
}

// ============================================================
// Clarifying email auto-draft
// ============================================================

/**
 * Missing-field labels for the clarifying email generator.
 * Maps field name → human-readable question phrasing.
 */
const CLARIFYING_QUESTIONS: Record<string, string> = {
  shoot_location: 'the shoot location (studio, outdoor venue, suburb)',
  shoot_dates: 'the preferred shoot date(s)',
  talent_spec: 'the talent spec (number of models, look, gender, age range)',
  deliverables_type: 'the deliverables required (e.g. stills, video, BTS)',
  deliverables_count: 'the number of final images/selects you need',
  usage_duration_months: 'the intended usage period (in months or years)',
};

/**
 * Draft a polite clarifying email to the client asking about missing brief fields.
 * Uses LLM when ANTHROPIC_API_KEY is set; falls back to a template.
 * When Google is not configured, returns the body for clipboard copy.
 */
export async function draftClarifyingEmailAction(
  bookingId: string,
  missingFields: string[],
): Promise<
  | { ok: true; mode: 'drafted'; draftId: string | undefined }
  | { ok: true; mode: 'no_google'; body: string }
  | { error: string }
> {
  const booking = await getBooking(bookingId);
  if (!booking) return { error: 'Booking not found' };

  const clientEmail = booking.client?.email ?? null;
  if (!clientEmail) return { error: 'No client email on this booking — add one to the client profile first.' };

  const clientName = booking.client?.company || booking.client?.name || 'there';
  const ref = booking.booking_ref ?? bookingId.slice(0, 8);

  // Build the list of questions
  const questions = missingFields
    .map((f) => CLARIFYING_QUESTIONS[f])
    .filter(Boolean);

  if (questions.length === 0) return { error: 'No missing fields to ask about.' };

  let body: string;

  // Try LLM first — up to 2 attempts with critique-driven revision
  // (doctrine: critique pass before serving). If LLM is unavailable
  // or critique never passes, fall through to the template.
  const systemPrompt = jasperVoicePromptBlock();
  const initialPrompt = `Write a short clarifying email from Saunders & Co to ${clientName} (client).
Reference: ${ref} — ${booking.title}

We received their brief but need clarification on these points:
${questions.map((q, i) => `${i + 1}. ${q}`).join('\n')}

Write only the email body (no subject line). Keep it under 120 words.`;

  let llmBody: string | null = null;
  let revisionNote = '';
  for (let attempt = 0; attempt < 2; attempt++) {
    const llmResult = await callLLM({
      purpose: 'brief_clarify',
      bookingId,
      maxTokens: 400,
      systemPrompt,
      messages: [{
        role: 'user',
        content: revisionNote
          ? `${initialPrompt}\n\nPrevious draft was rejected because: ${revisionNote}\nRewrite addressing that.`
          : initialPrompt,
      }],
    }).catch(() => null);

    if (!llmResult?.ok) break;

    const draft = llmResult.text;
    const critique = await critiqueDraft({
      draft,
      recipient: 'a busy creative director or producer at the client agency',
      context: `awaiting clarification on a brief for ${booking.title}`,
      bookingId,
    });

    // No critique available, or critique passed — ship it.
    if (!critique || critique.isClear) {
      llmBody = draft;
      break;
    }
    // Critique failed; capture the note and try once more.
    revisionNote = critique.revisionNeeded || critique.reaction;
  }

  if (llmBody) {
    body = llmBody;
  } else {
    // Template fallback
    const questionList = questions.map((q, i) => `${i + 1}. Could you please confirm ${q}?`).join('\n');
    const agencyCfg = getAgencyConfig();
    const signoff = [agencyCfg.ownerName, agencyCfg.name, agencyCfg.email].filter(Boolean).join('\n');
    body = `Hi ${clientName},\n\nThank you for the brief on ${booking.title} (${ref}). To get started on your quote, could you please clarify a few points:\n\n${questionList}\n\nOnce we have these details we can get a quote to you quickly.\n\n${signoff}`;
  }

  const subject = `[${ref}] Brief follow-up — ${booking.title}`;

  if (!isGoogleConfigured()) {
    return { ok: true, mode: 'no_google', body };
  }

  const draft = await draftEmail({
    to: [clientEmail],
    subject,
    body: body.replace(/\n/g, '<br>'),
    bookingRef: ref,
  });

  return { ok: true, mode: 'drafted', draftId: draft.draftId };
}

// ============================================================
// Pay-on-paid — mark artist / crew payment
// ============================================================

/**
 * Stamps artist_paid_at on a booking_talent row.
 * Should only be called once the client has paid (booking.state === 'paid').
 */
export async function markTalentPaidAction(
  bookingTalentId: string,
  bookingId: string,
): Promise<{ ok: true } | { error: string }> {
  const appUser = await getCurrentAppUser();
  if (!appUser || (appUser.role !== 'owner' && appUser.role !== 'partner')) {
    return { error: 'Not authorised.' };
  }

  const booking = await getBooking(bookingId);
  if (!booking) return { error: 'Booking not found.' };
  if (!['invoice_issued', 'paid'].includes(booking.state)) {
    return { error: `Cannot mark payment on a booking in '${booking.state}' state.` };
  }

  const { createClient } = await import('@/lib/supabase/server');
  const supabase = await createClient();

  // Fetch the booking_talent row to get talent_id
  const { data: bt } = await supabase
    .from('atelier_booking_talent')
    .select('talent_id')
    .eq('id', bookingTalentId)
    .single();

  const { error } = await supabase
    .from('atelier_booking_talent')
    .update({ artist_paid_at: new Date().toISOString() })
    .eq('id', bookingTalentId);

  if (error) return { error: error.message };

  // Send remittance advice email if we have talent details
  if (bt?.talent_id && checkKillSwitch && isGoogleConfigured()) {
    try {
      const ks = await checkKillSwitch();
      if (ks.canSendOutbound) {
        const [talentResult, feeLinesResult] = await Promise.all([
          supabase.from('atelier_talent').select('email, working_name').eq('id', bt.talent_id).maybeSingle(),
          // Remittance amount uses cost_subtotal (what's actually paid) when set,
          // otherwise falls back to subtotal (legacy behaviour preserved).
          supabase.from('atelier_fee_lines').select('subtotal, cost_subtotal').eq('booking_id', bookingId).eq('talent_id', bt.talent_id),
        ]);
        const talent = talentResult.data;
        if (talent?.email && talent?.working_name) {
          const total = (feeLinesResult.data ?? []).reduce((sum, l) => sum + Number(l.cost_subtotal ?? l.subtotal), 0);
          const email = buildRemittanceEmail(
            { working_name: talent.working_name, email: talent.email },
            { booking_ref: booking.booking_ref ?? bookingId, title: booking.title },
            total,
          );
          await sendEmail({ to: [talent.email], subject: email.subject, body: email.body });
          await logAudit({ userId: await getCurrentActor(), action: 'remittance_email_sent', tableName: 'atelier_booking_talent', recordId: bookingTalentId, newValue: { to: talent.email, bookingId } });
        }
      }
    } catch (err) {
      await logAudit({ userId: await getCurrentActor(), action: 'remittance_email_failed', tableName: 'atelier_booking_talent', recordId: bookingTalentId, newValue: { error: String(err), bookingId } }).catch(() => {});
    }
  }

  revalidatePath(`/bookings/${bookingId}`);
  return { ok: true };
}

/**
 * Stamps artist_paid_at on a booking_crew row.
 * Should only be called once the client has paid (booking.state === 'paid').
 */
export async function markCrewPaidAction(
  bookingCrewId: string,
  bookingId: string,
): Promise<{ ok: true } | { error: string }> {
  const appUser = await getCurrentAppUser();
  if (!appUser || (appUser.role !== 'owner' && appUser.role !== 'partner')) {
    return { error: 'Not authorised.' };
  }

  const booking = await getBooking(bookingId);
  if (!booking) return { error: 'Booking not found.' };
  if (!['invoice_issued', 'paid'].includes(booking.state)) {
    return { error: `Cannot mark payment on a booking in '${booking.state}' state.` };
  }

  const { createClient } = await import('@/lib/supabase/server');
  const supabase = await createClient();

  // Fetch the booking_crew row to get crew_id
  const { data: bc } = await supabase
    .from('atelier_booking_crew')
    .select('crew_id')
    .eq('id', bookingCrewId)
    .single();

  const { error } = await supabase
    .from('atelier_booking_crew')
    .update({ artist_paid_at: new Date().toISOString() })
    .eq('id', bookingCrewId);

  if (error) return { error: error.message };

  // Send remittance advice email if we have crew details
  if (bc?.crew_id && checkKillSwitch && isGoogleConfigured()) {
    try {
      const ks = await checkKillSwitch();
      if (ks.canSendOutbound) {
        const [crewResult, feeLinesResult] = await Promise.all([
          supabase.from('atelier_crew').select('email, name').eq('id', bc.crew_id).maybeSingle(),
          // Cost-aware: uses cost_subtotal when set, falls back to subtotal.
          supabase.from('atelier_fee_lines').select('subtotal, cost_subtotal').eq('booking_id', bookingId).eq('crew_id', bc.crew_id),
        ]);
        const crew = crewResult.data;
        if (crew?.email && crew?.name) {
          const total = (feeLinesResult.data ?? []).reduce((sum, l) => sum + Number(l.cost_subtotal ?? l.subtotal), 0);
          const email = buildRemittanceEmail(
            { working_name: crew.name, email: crew.email },
            { booking_ref: booking.booking_ref ?? bookingId, title: booking.title },
            total,
          );
          await sendEmail({ to: [crew.email], subject: email.subject, body: email.body });
          await logAudit({ userId: await getCurrentActor(), action: 'remittance_email_sent', tableName: 'atelier_booking_crew', recordId: bookingCrewId, newValue: { to: crew.email, bookingId } });
        }
      }
    } catch (err) {
      await logAudit({ userId: await getCurrentActor(), action: 'remittance_email_failed', tableName: 'atelier_booking_crew', recordId: bookingCrewId, newValue: { error: String(err), bookingId } }).catch(() => {});
    }
  }

  revalidatePath(`/bookings/${bookingId}`);
  return { ok: true };
}

// ============================================================
// Regenerate Quote V1 from artist's discipline template
// ============================================================
//
// Used by the "Generate Quote V1" button on bookings that don't yet have
// a quote — typically legacy bookings created before the auto-quote
// feature, or bookings whose primary artist was set later.
//
// Refuses to run if the booking already has any quote versions, to avoid
// overwriting manual work. Jasper can delete versions via the UI first
// if he really wants a clean V1.

export async function regenerateQuoteV1Action(bookingId: string) {
  const existing = await listQuoteVersions(bookingId);
  if (existing.length > 0) {
    return { error: 'Quote already exists. Delete existing versions first to regenerate.' };
  }

  const bookingTalent = await listBookingTalent(bookingId);
  const primary = bookingTalent[0] as (typeof bookingTalent[0] & { talent?: { discipline: string; default_day_rate: number | null } | null }) | undefined;
  if (!primary?.talent) {
    return { error: 'No primary artist on this booking. Add an artist first.' };
  }

  const discipline = primary.talent.discipline;
  if (discipline !== 'photographer' && discipline !== 'videographer') {
    return { error: `No template for ${discipline}. Templates exist for photographer and videographer only.` };
  }

  const qvId = await generateQuoteV1FromTemplate(
    bookingId,
    discipline,
    primary.talent.default_day_rate ?? primary.day_rate ?? null,
  );
  if (!qvId) return { error: 'Quote generation failed.' };

  revalidatePath(`/bookings/${bookingId}`);
  return { ok: true, quoteVersionId: qvId };
}

// ============================================================
// Clone an existing booking
// ============================================================
//
// Creates a fresh booking row with the same client, brand, tier, deliverables,
// usage media/territory/duration, post-production ownership, all attached
// talent, and all attached crew as the source. Dates are offset by 30 days
// from the source's start (or null if the source had no shoot dates). Title
// gets " (Copy)" appended.
//
// Quote V1 is auto-generated from the primary artist's discipline template.
// Crew start fresh in 'hold_requested' so availability is re-confirmed.
// Confirmations, OT, expenses, send history, and Drive links are NOT copied.

export async function cloneBookingAction(sourceId: string) {
  const source = await getBooking(sourceId);
  if (!source) return { error: 'Source booking not found' };

  // Offset dates by 30 days. The original source.shoot_dates is a Postgres
  // daterange; we already have buildDateRange + dateRangeToInputs to convert.
  const inputs = dateRangeToInputs(source.shoot_dates);
  let newDates: string | null = null;
  if (inputs.start) {
    const startDate = new Date(inputs.start);
    startDate.setDate(startDate.getDate() + 30);
    const endDate = inputs.end ? new Date(inputs.end) : new Date(inputs.start);
    if (inputs.end) endDate.setDate(endDate.getDate() + 30);
    newDates = buildDateRange(
      startDate.toISOString().slice(0, 10),
      endDate.toISOString().slice(0, 10),
    );
  }

  const cloneInput: CreateBookingInput = {
    title: `${source.title} (Copy)`,
    tier: source.tier,
    client_id: source.client_id,
    brand_id: source.brand_id,
    creative_agency_id: source.creative_agency_id,
    shoot_location: source.shoot_location,
    shoot_date_notes: null, // Don't copy "TBD pending client" — fresh booking
    shoot_dates: newDates,
    talent_count: source.talent_count,
    talent_spec: source.talent_spec,
    deliverables_type: source.deliverables_type,
    deliverables_count: source.deliverables_count,
    usage_duration_months: source.usage_duration_months,
    usage_notes: source.usage_notes,
    post_production_ownership: source.post_production_ownership,
    agency_notes: null,
    brief_raw_text: null, // Fresh brief expected
    usage_media: source.usage_media,
    usage_territory: source.usage_territory,
  };

  const newBooking = await createBooking(cloneInput);
  if (!newBooking) return { error: 'Failed to clone booking' };

  // Copy the primary artist (first booking_talent row) to the new booking.
  // We don't copy day_rate from the old row — instead pull the artist's
  // current default_day_rate, which may have changed since.
  const sourceTalent = await listBookingTalent(sourceId);
  const primary = sourceTalent[0] as (typeof sourceTalent[0] & { talent?: { default_day_rate: number | null; discipline: string } | null }) | undefined;

  const supabase = await createSupabaseServer();

  // Clone ALL talent rows, not just the primary. Day rates are pulled from
  // each artist's current default_day_rate so a clone reflects "what they'd
  // charge today" rather than what they charged on the source booking.
  if (sourceTalent.length > 0) {
    const talentRows = sourceTalent.map((bt) => {
      const tw = bt as typeof bt & { talent?: { default_day_rate: number | null; discipline: string } | null };
      return {
        booking_id: newBooking.id,
        talent_id: bt.talent_id,
        role_on_booking: bt.role_on_booking || tw.talent?.discipline || 'photographer',
        day_rate: tw.talent?.default_day_rate ?? null,
        confirmed: false,
      };
    });
    await supabase.from('atelier_booking_talent').insert(talentRows);

    // Auto-generate Quote V1 from the primary artist's discipline template
    if (primary) {
      const tw = primary as typeof primary & { talent?: { default_day_rate: number | null; discipline: string } | null };
      const discipline = tw.talent?.discipline ?? '';
      if (discipline === 'photographer' || discipline === 'videographer') {
        await generateQuoteV1FromTemplate(newBooking.id, discipline, tw.talent?.default_day_rate ?? null);
      }
    }
  }

  // Clone crew assignments — only crew_id + role hint, NOT statuses or day
  // rates from the old booking. Each crew row starts fresh in "hold_requested"
  // so the producer re-confirms availability for the new dates.
  const sourceCrew = await listBookingCrew(sourceId);
  if (sourceCrew.length > 0) {
    const crewRows = sourceCrew.map((bc) => ({
      booking_id: newBooking.id,
      crew_id: bc.crew_id,
      role_on_booking: bc.role_on_booking,
      day_rate: bc.day_rate, // Keep the rate they charged — usually still right
      status: 'hold_requested' as const,
    }));
    await supabase.from('atelier_booking_crew').insert(crewRows);
  }

  revalidatePath('/bookings');
  revalidateTag('bookings', {});
  revalidatePath(`/clients/${source.client_id}`);
  return { id: newBooking.id, ref: newBooking.booking_ref };
}

// ============================================================
// Client usage defaults — autofill on new booking
// ============================================================
//
// Returns the most-frequently-used media, territory, and duration values
// from the client's last 3 bookings. Used by BookingFormFields to pre-tick
// checkboxes when a client is selected on the new-booking form.
//
// A value must appear in at least ceil(n/2) of the n recent bookings to be
// included (majority threshold). Duration uses the modal value; ties go to
// the most recent booking.

export async function getClientDefaultsAction(clientId: string): Promise<{
  media: string[];
  territories: string[];
  durationMonths: number | null;
}> {
  const supabase = await createSupabaseServer();
  const { data } = await supabase
    .from('atelier_bookings')
    .select('usage_media, usage_territory, usage_duration_months')
    .eq('client_id', clientId)
    .order('created_at', { ascending: false })
    .limit(3);

  if (!data || data.length === 0) return { media: [], territories: [], durationMonths: null };

  const n = data.length;
  const threshold = Math.ceil(n / 2);

  const mediaCounts: Record<string, number> = {};
  const territoryCounts: Record<string, number> = {};
  const durations: number[] = [];

  for (const b of data) {
    for (const m of (b.usage_media ?? [])) mediaCounts[m] = (mediaCounts[m] ?? 0) + 1;
    for (const t of (b.usage_territory ?? [])) territoryCounts[t] = (territoryCounts[t] ?? 0) + 1;
    if (b.usage_duration_months != null) durations.push(b.usage_duration_months);
  }

  const media = Object.entries(mediaCounts)
    .filter(([, count]) => count >= threshold)
    .map(([key]) => key);

  const territories = Object.entries(territoryCounts)
    .filter(([, count]) => count >= threshold)
    .map(([key]) => key);

  let durationMonths: number | null = null;
  if (durations.length > 0) {
    const durationCounts: Record<number, number> = {};
    for (const d of durations) durationCounts[d] = (durationCounts[d] ?? 0) + 1;
    durationMonths = durations.reduce((best, d) =>
      (durationCounts[d] > durationCounts[best]) ? d : best, durations[0]);
  }

  return { media, territories, durationMonths };
}

// ============================================================
// Hard delete (terminal bookings only)
// ============================================================

/**
 * Permanently delete a booking, archiving an anonymised row to
 * atelier_corpus_bookings before the cascade fires.
 *
 * Owner/partner only — this is an irreversible destructive op and the
 * action runs the underlying delete via the service client (bypasses
 * RLS). Adding the guard was missed when the function was first wired;
 * surfaced 2026-05-16 alongside the FK fix.
 *
 * Only permitted for terminal states: paid, released, cancelled, written_off.
 *
 * Returns the full Postgres error on failure so the UI can show
 * something actionable instead of "Delete returned false".
 */
export async function deleteBookingAction(
  bookingId: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  // Auth — destructive irreversible op on a service-client write path.
  const appUser = await getCurrentAppUser();
  if (!appUser || (appUser.role !== 'owner' && appUser.role !== 'partner')) {
    return { ok: false, error: 'Forbidden — owner or partner role required.' };
  }

  try {
    // Pull the calendar_event_id BEFORE deleting so we can also remove
    // the Google Calendar event. Google sends "this event was cancelled"
    // emails to all attendees automatically.
    const booking = await getBooking(bookingId);
    const calendarEventId = booking?.calendar_event_id ?? null;

    const result = await deleteBookingWithCorpus(bookingId);
    if (!result.ok) return result;

    if (calendarEventId) {
      deleteCalendarEvent(calendarEventId).catch((err) =>
        reportDataError('[deleteBookingAction] Calendar event delete failed', err),
      );
    }

    revalidatePath('/bookings');
    revalidatePath('/');
    revalidateTag('bookings', {});
    return { ok: true };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return { ok: false, error: msg };
  }
}

/**
 * Archive a booking — hide from active lists but keep all data intact.
 * Reversible via unarchiveBookingAction. The opposite of delete: this is
 * for shoots that are over but might still be referenced or recovered.
 */
export async function archiveBookingAction(
  bookingId: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  try {
    const supabase = await createSupabaseServer();
    const { error } = await supabase
      .from('atelier_bookings')
      .update({ is_archived: true, archived_at: new Date().toISOString() })
      .eq('id', bookingId);

    if (error) {
      await logAuditFailure({
        userId: await getCurrentActor(),
        action: 'archive_booking',
        tableName: 'atelier_bookings',
        recordId: bookingId,
        error: error.message,
      }).catch(() => {});
      return { ok: false, error: error.message };
    }

    revalidatePath('/bookings');
  revalidateTag('bookings', {});
    revalidatePath(`/bookings/${bookingId}`);
    return { ok: true };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return { ok: false, error: msg };
  }
}

/**
 * Unarchive a booking — restore it to the active list.
 */
export async function unarchiveBookingAction(
  bookingId: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  try {
    const supabase = await createSupabaseServer();
    const { error } = await supabase
      .from('atelier_bookings')
      .update({ is_archived: false, archived_at: null })
      .eq('id', bookingId);

    if (error) {
      await logAuditFailure({
        userId: await getCurrentActor(),
        action: 'unarchive_booking',
        tableName: 'atelier_bookings',
        recordId: bookingId,
        error: error.message,
      }).catch(() => {});
      return { ok: false, error: error.message };
    }

    revalidatePath('/bookings');
  revalidateTag('bookings', {});
    revalidatePath(`/bookings/${bookingId}`);
    return { ok: true };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return { ok: false, error: msg };
  }
}

/**
 * Brief auto-detect Option B (PR#52).
 *
 * Convert a Gmail message into a `brief_received` booking. Pulls the
 * email body via Gmail API and stores it as brief_raw_text, sets the
 * subject as the title, and lands the booking in the early state. The
 * producer then runs the existing brief parser on it.
 *
 * Returns the new booking's id on success so the caller can redirect
 * straight to its detail page.
 */
export async function convertEmailToBookingAction(opts: {
  messageId: string;
  subject: string;
  fromHeader: string;
}): Promise<{ ok: true; bookingId: string } | { ok: false; error: string }> {
  try {
    // Auth — mutation, owner/partner only
    const appUser = await (await import('@/lib/data/app-users')).getCurrentAppUser();
    if (!appUser || (appUser.role !== 'owner' && appUser.role !== 'partner')) {
      return { ok: false, error: 'Forbidden' };
    }

    const { getMessageBody } = await import('@/lib/integrations/gmail');
    const body = await getMessageBody(opts.messageId);
    if (!body) {
      return { ok: false, error: 'Could not fetch the email body. Try opening it in Gmail and copy-pasting into a new booking instead.' };
    }

    // Title — use the email subject, stripped of common Re:/Fwd: prefixes
    const title = (opts.subject || 'Untitled brief')
      .replace(/^(re:|fwd:|fw:)\s*/gi, '')
      .trim()
      .slice(0, 200);

    // Default tier — `content` is the safest default for an unspecified
    // brief. The producer will adjust on the booking detail page.
    const input: CreateBookingInput = {
      title,
      tier: 'content',
      client_id: null,
      brand_id: null,
      creative_agency_id: null,
      shoot_location: null,
      shoot_date_notes: null,
      shoot_dates: null,
      talent_count: null,
      talent_spec: null,
      deliverables_type: null,
      deliverables_count: null,
      usage_duration_months: null,
      usage_notes: null,
      post_production_ownership: null,
      agency_notes: `Auto-imported from email (${opts.fromHeader}).`,
      brief_raw_text: body,
      usage_media: null,
      usage_territory: null,
      // Enables the "Undo conversion" affordance on the booking detail page
      // and excludes this message from future Potential Briefs scans.
      source_gmail_message_id: opts.messageId,
    };

    const booking = await createBooking(input);
    if (!booking) {
      return { ok: false, error: 'createBooking returned null — check server logs.' };
    }

    await logAudit({
      userId: await getCurrentActor(),
      action: 'convert_email_to_booking',
      tableName: 'atelier_bookings',
      recordId: booking.id,
      newValue: ({ messageId: opts.messageId, subject: opts.subject } as unknown) as import('@/lib/types/database').Json,
    }).catch(() => {}); // best-effort log

    revalidatePath('/inbox');
    revalidatePath('/bookings');
  revalidateTag('bookings', {});
    return { ok: true, bookingId: booking.id };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return { ok: false, error: msg };
  }
}

/**
 * Undo an auto-conversion from Gmail.
 *
 * Tight guards — all four must hold:
 *   1. Caller is owner/partner
 *   2. Booking has `source_gmail_message_id` set (was auto-converted)
 *   3. Booking state is still `brief_received` (no work attached yet)
 *   4. Booking created < 24h ago (after that, it's the user's problem)
 *
 * On success, the booking row is deleted directly (bypassing the
 * terminal-state guard in `deleteBookingWithCorpus` because this row
 * is intentionally fresh and has no real data). The email then re-appears
 * naturally in Potential Briefs on the next scan because `findPotentialBriefs`
 * filters out converted-source IDs and that filter is now empty for it.
 *
 * No corpus archival — there is nothing meaningful to archive.
 */
export async function undoBookingConversionAction(
  bookingId: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  try {
    const appUser = await (await import('@/lib/data/app-users')).getCurrentAppUser();
    if (!appUser || (appUser.role !== 'owner' && appUser.role !== 'partner')) {
      return { ok: false, error: 'Forbidden' };
    }

    const booking = await getBooking(bookingId);
    if (!booking) return { ok: false, error: 'Booking not found' };
    if (!booking.source_gmail_message_id) {
      return { ok: false, error: 'Not eligible — this booking was not created from a Gmail import.' };
    }
    if (booking.state !== 'brief_received') {
      return { ok: false, error: `Not eligible — booking has advanced to ${booking.state}. Use Archive or Delete instead.` };
    }
    const ageMs = Date.now() - new Date(booking.created_at).getTime();
    if (ageMs > 24 * 3600 * 1000) {
      return { ok: false, error: 'Not eligible — undo window (24h) has closed. Use Archive or Delete instead.' };
    }

    // Direct DELETE — FK cascade cleans up booking_talent, booking_crew,
    // fee_lines, quote_versions, etc. No corpus archival because there's
    // nothing of value to keep.
    const supabase = await createSupabaseServer();
    const { error } = await supabase.from('atelier_bookings').delete().eq('id', bookingId);
    if (error) return { ok: false, error: error.message };

    await logAudit({
      userId: await getCurrentActor(),
      action: 'undo_booking_conversion',
      tableName: 'atelier_bookings',
      recordId: bookingId,
      newValue: ({
        source_gmail_message_id: booking.source_gmail_message_id,
        title: booking.title,
      } as unknown) as import('@/lib/types/database').Json,
    }).catch(() => {});

    revalidatePath('/inbox');
    revalidatePath('/bookings');
    revalidateTag('bookings', {});
    return { ok: true };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return { ok: false, error: msg };
  }
}

/**
 * Send a quick ad-hoc email from within the booking context.
 * No state transition — just sends and logs.
 * mode='draft' creates a Gmail draft; mode='send' sends immediately.
 */
export async function sendQuickEmailAction(opts: {
  bookingId: string;
  to: string;
  subject: string;
  body: string;
  mode: 'send' | 'draft';
}): Promise<{ ok: true; mode: 'sent' | 'drafted' | 'no_google' } | { ok: false; error: string }> {
  const { bookingId, to, subject, body, mode } = opts;

  const appUser = await getCurrentAppUser();
  if (!appUser || (appUser.role !== 'owner' && appUser.role !== 'partner')) {
    return { ok: false, error: 'Not authorised.' };
  }

  if (!to.trim()) return { ok: false, error: 'Recipient email is required.' };
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(to.trim())) {
    return { ok: false, error: 'Recipient must be a valid email address.' };
  }
  if (!subject.trim()) return { ok: false, error: 'Subject is required.' };
  if (!body.trim()) return { ok: false, error: 'Message body is required.' };

  const booking = await getBooking(bookingId);
  if (!booking) return { ok: false, error: 'Booking not found.' };

  if (!isGoogleConfigured()) {
    return { ok: true, mode: 'no_google' };
  }

  if (mode === 'send') {
    const ks = await checkKillSwitch();
    if (!ks.canSendOutbound) {
      return { ok: false, error: `Outbound email paused (kill switch: ${ks.level}). Use Draft instead.` };
    }
  }

  const actor = await getCurrentActor();

  try {
    if (mode === 'send') {
      await sendEmail({ to: [to], subject, body, bookingRef: booking.booking_ref ?? undefined });
      await logAudit({
        userId: actor,
        action: 'quick_email_sent',
        tableName: 'atelier_bookings',
        recordId: bookingId,
        newValue: ({ to, subject } as unknown) as import('@/lib/types/database').Json,
      }).catch(() => {});
      revalidatePath(`/bookings/${bookingId}`);
      return { ok: true, mode: 'sent' };
    } else {
      await draftEmail({ to: [to], subject, body, bookingRef: booking.booking_ref ?? undefined });
      await logAudit({
        userId: actor,
        action: 'quick_email_drafted',
        tableName: 'atelier_bookings',
        recordId: bookingId,
        newValue: ({ to, subject } as unknown) as import('@/lib/types/database').Json,
      }).catch(() => {});
      revalidatePath(`/bookings/${bookingId}`);
      return { ok: true, mode: 'drafted' };
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    await logAuditFailure({
      userId: actor,
      action: mode === 'send' ? 'quick_email_sent' : 'quick_email_drafted',
      tableName: 'atelier_bookings',
      recordId: bookingId,
      error: msg,
    }).catch(() => {});
    return { ok: false, error: msg };
  }
}
