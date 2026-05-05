'use server';

import { revalidatePath } from 'next/cache';
import { createBooking, getBooking, updateBooking, transitionState, type CreateBookingInput } from '@/lib/data/bookings';
import { createQuoteVersion, addFeeLine } from '@/lib/data/quotes';
import { TEMPLATE_LINES_MAP } from '@/lib/utils/quote-templates';
import { proposeHoldRequests } from '@/lib/automation/hold-requests';
import { checkKillSwitch } from '@/lib/utils/kill-switch';
import { extractBriefFields } from '@/lib/automation/brief-intake';
import { buildDateRange } from '@/lib/utils/daterange';
import { createBookingFolders, createSharedLink } from '@/lib/integrations/drive';
import { createCalendarEvent, deleteCalendarEvent } from '@/lib/integrations/calendar';
import { sendEmail, draftEmail } from '@/lib/integrations/gmail';
import { isGoogleConfigured } from '@/lib/integrations/google-auth';
import { callLLM } from '@/lib/integrations/anthropic';
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

  // Link the primary artist immediately so the booking shows the artist on creation.
  // Role defaults to the artist's discipline (e.g. "photographer").
  const primaryTalentId = (formData.get('primary_talent_id') as string) || null;
  const discipline = (formData.get('primary_talent_discipline') as string) || '';

  if (primaryTalentId) {
    const { createClient: createSupabase } = await import('@/lib/supabase/server');
    const supabase = await createSupabase();

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
    // Only photographer and videographer have standard templates — other
    // disciplines (stylist, HMU etc.) are typically not the lead artist.
    if (discipline === 'photographer' || discipline === 'videographer') {
      const shootFeeOverride = talentRow?.default_day_rate ?? undefined;
      const qv = await createQuoteVersion(booking.id);
      if (qv) {
        const lines = TEMPLATE_LINES_MAP[discipline];
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
            booking_id: booking.id,
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
      }
    }
  }

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
          console.error('[transitionBookingAction] confirmation email draft failed', err),
        );
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

  // Media and territory land in usage_notes (freetext) as a parser extract.
  // Jasper reviews and selects the structured enum values from the booking form.
  const mediaRaw = formData.get('usage_media_raw') as string | null;
  const territoryRaw = formData.get('usage_territory_raw') as string | null;
  if (mediaRaw || territoryRaw) {
    const noteParts: string[] = [];
    if (mediaRaw) noteParts.push(`Media (parser): ${mediaRaw}`);
    if (territoryRaw) noteParts.push(`Territory (parser): ${territoryRaw}`);
    // Append to existing notes rather than overwrite
    const existing = await getBooking(id);
    const existingNotes = existing?.usage_notes ?? null;
    const newNotes = existingNotes
      ? `${existingNotes}\n${noteParts.join('\n')}`
      : noteParts.join('\n');
    updates.usage_notes = newNotes;
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
  lines.push('<p style="margin-top:24px">Jasper Bailey<br>Saunders &amp; Co<br><a href="mailto:info@saundersandco.com.au">info@saundersandco.com.au</a></p>');
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

  // Try LLM first
  const llmResult = await callLLM({
    purpose: 'brief_clarify',
    bookingId,
    maxTokens: 400,
    messages: [{
      role: 'user',
      content: `Write a short, friendly email from Jasper Bailey at Saunders & Co to ${clientName} (client).
Reference: ${ref} — ${booking.title}

We received their brief but need clarification on these points:
${questions.map((q, i) => `${i + 1}. ${q}`).join('\n')}

Write only the email body (no subject line). Keep it under 120 words. End with:
Jasper Bailey
Saunders & Co
info@saundersandco.com.au`,
    }],
  }).catch(() => null);

  if (llmResult?.ok) {
    body = llmResult.text;
  } else {
    // Template fallback
    const questionList = questions.map((q, i) => `${i + 1}. Could you please confirm ${q}?`).join('\n');
    body = `Hi ${clientName},\n\nThank you for the brief on ${booking.title} (${ref}). To get started on your quote, could you please clarify a few points:\n\n${questionList}\n\nOnce we have these details we can get a quote to you quickly.\n\nJasper Bailey\nSaunders & Co\ninfo@saundersandco.com.au`;
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
  const { createClient } = await import('@/lib/supabase/server');
  const supabase = await createClient();

  const { error } = await supabase
    .from('atelier_booking_talent')
    .update({ artist_paid_at: new Date().toISOString() })
    .eq('id', bookingTalentId);

  if (error) return { error: error.message };

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
  const { createClient } = await import('@/lib/supabase/server');
  const supabase = await createClient();

  const { error } = await supabase
    .from('atelier_booking_crew')
    .update({ artist_paid_at: new Date().toISOString() })
    .eq('id', bookingCrewId);

  if (error) return { error: error.message };

  revalidatePath(`/bookings/${bookingId}`);
  return { ok: true };
}
