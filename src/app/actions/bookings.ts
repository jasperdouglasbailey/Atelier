'use server';

import { revalidatePath } from 'next/cache';
import { createBooking, getBooking, updateBooking, transitionState, type CreateBookingInput } from '@/lib/data/bookings';
import { proposeHoldRequests } from '@/lib/automation/hold-requests';
import { checkKillSwitch } from '@/lib/utils/kill-switch';
import { extractBriefFields } from '@/lib/automation/brief-intake';
import { buildDateRange } from '@/lib/utils/daterange';
import { createBookingFolders, createSharedLink } from '@/lib/integrations/drive';
import { createCalendarEvent, deleteCalendarEvent } from '@/lib/integrations/calendar';
import { sendEmail, draftEmail } from '@/lib/integrations/gmail';
import { isGoogleConfigured } from '@/lib/integrations/google-auth';
import { dateRangeToInputs } from '@/lib/utils/daterange';
import type { BookingState } from '@/lib/types/database';

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
    talent_count: formData.get('talent_count') ? Number(formData.get('talent_count')) : null,
    talent_spec: (formData.get('talent_spec') as string) || null,
    deliverables_type: (formData.get('deliverables_type') as string) || null,
    deliverables_count: formData.get('deliverables_count') ? Number(formData.get('deliverables_count')) : null,
    usage_duration_months: formData.get('usage_duration_months') ? Number(formData.get('usage_duration_months')) : null,
    usage_notes: (formData.get('usage_notes') as string) || null,
    post_production_ownership: (formData.get('post_production_ownership') as string) || null,
    agency_notes: (formData.get('agency_notes') as string) || null,
    brief_raw_text: (formData.get('brief_raw_text') as string) || null,
    usage_media: usageMedia,
    usage_territory: usageTerritory,
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

  // On quote_confirmed: create Drive folders + Calendar event, both async.
  // Neither blocks the state transition itself.
  if (newState === 'quote_confirmed') {
    const booking = await getBooking(id);
    if (booking) {
      const year = new Date().getFullYear();

      // Drive folders
      if (booking.booking_ref) {
        createBookingFolders(booking.booking_ref, year)
          .then((driveIds) => {
            if (!driveIds) return;
            return updateBooking(id, {
              drive_root_id: driveIds.root_id,
              drive_folder_ids: driveIds.folder_ids,
              drive_root_link: driveIds.root_link,
            });
          })
          .catch((err) => console.error('[transitionBookingAction] Drive folder creation failed', err));
      }

      // Calendar event — only if shoot dates are known
      const { start, end } = dateRangeToInputs(booking.shoot_dates);
      if (start) {
        const clientName = (booking as { client?: { name: string; company?: string | null } | null }).client?.company
          ?? (booking as { client?: { name: string; company?: string | null } | null }).client?.name;
        const subject = [booking.booking_ref, booking.title, clientName].filter(Boolean).join(' — ');
        createCalendarEvent({
          subject,
          startDate: start,
          endDate: end || start,
          location: booking.shoot_location ?? undefined,
          description: [
            `Tier: ${booking.tier}`,
            booking.talent_spec ? `Talent: ${booking.talent_spec}` : '',
          ].filter(Boolean).join('\n'),
          bookingRef: booking.booking_ref ?? undefined,
        })
          .then((result) => {
            if (!result) return;
            return updateBooking(id, { calendar_event_id: result.eventId });
          })
          .catch((err) => console.error('[transitionBookingAction] Calendar event creation failed', err));
      }
    }
  }

  // On release or cancel: remove the calendar event so Jasper's calendar stays clean.
  if (newState === 'released' || newState === 'cancelled') {
    const booking = await getBooking(id);
    if (booking?.calendar_event_id) {
      deleteCalendarEvent(booking.calendar_event_id).catch((err) =>
        console.error('[transitionBookingAction] Calendar event deletion failed', err),
      );
    }
  }

  // On final_delivery: create a shared client-delivery link for the Finals folder.
  if (newState === 'final_delivery') {
    const booking = await getBooking(id);
    const finalsId = (booking?.drive_folder_ids as { finals?: string } | null)?.finals;
    if (finalsId) {
      createSharedLink(finalsId)
        .then((link) => {
          if (!link) return;
          // Persist the Finals shared link in agency_notes as a reference until
          // we have a dedicated delivery_link column.
          const existingNotes = booking?.agency_notes ?? '';
          const noteEntry = `[Drive Finals] ${link}`;
          if (!existingNotes.includes(noteEntry)) {
            return updateBooking(id, {
              agency_notes: existingNotes ? `${existingNotes}\n${noteEntry}` : noteEntry,
            });
          }
        })
        .catch((err) => console.error('[transitionBookingAction] Drive shared link failed', err));
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
  lines.push('<p>To confirm, please reply to this email. We\'ll hold the dates and issue paperwork once we hear from you.</p>');
  lines.push('<p style="margin-top:24px">Jasper Bailey<br>Saunders &amp; Co<br><a href="mailto:info@saundersandco.com.au">info@saundersandco.com.au</a></p>');
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

  const body = overrides?.body ?? buildQuoteEmailHtml({
    bookingRef: booking.booking_ref ?? '',
    title: booking.title,
    clientName,
    tier: booking.tier,
    grandTotal: booking.grand_total ?? 0,
    shootDates: booking.shoot_date_notes ?? null,
  });

  if (!isGoogleConfigured()) {
    return { ok: true, mode: 'no_google' as const, to: toEmail, subject, body };
  }

  if (mode === 'send') {
    const result = await sendEmail({ to: [toEmail], subject, body, bookingRef: booking.booking_ref ?? undefined });
    if (booking.state === 'quote_drafted') {
      await transitionState(bookingId, 'quote_sent');
    }
    revalidatePath(`/bookings/${bookingId}`);
    revalidatePath('/bookings');
    return { ok: true, mode: 'sent' as const, messageId: result.messageId };
  } else {
    const result = await draftEmail({ to: [toEmail], subject, body, bookingRef: booking.booking_ref ?? undefined });
    revalidatePath(`/bookings/${bookingId}`);
    return { ok: true, mode: 'drafted' as const, draftId: result.draftId };
  }
}
