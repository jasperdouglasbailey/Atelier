/**
 * Google Calendar Integration
 *
 * Creates shoot-day events on Jasper's primary calendar when a booking
 * reaches quote_confirmed. All-day events use the `date` format (no
 * timezone ambiguity). The `calendar.events` scope limits the app to
 * events it created — it cannot see or modify other calendar entries.
 *
 * Event link pattern: https://calendar.google.com/calendar/event?eid={base64(eventId)}
 * Simpler: just link to https://calendar.google.com/calendar/r — the event
 * shows up there.
 */

import { isGoogleConfigured, getAccessToken } from './google-auth';

const CALENDAR_BASE = 'https://www.googleapis.com/calendar/v3/calendars/primary/events';

export interface CalendarEventInput {
  subject: string;
  startDate: string;   // ISO date, e.g. "2026-05-15"
  endDate: string;     // ISO date, inclusive — stored as exclusive +1 day in API
  location?: string;
  description?: string;
  bookingRef?: string;
  /**
   * Email addresses to invite. Google sends invitation emails (and update
   * notifications when the event later moves) automatically. Empty array
   * means no invitations.
   */
  attendees?: Array<{ email: string; displayName?: string }>;
}

export interface CalendarEventResult {
  eventId: string;
  htmlLink: string;
}

/**
 * Create an all-day shoot event in Jasper's primary Google Calendar.
 * Returns the event ID and a direct link to the event.
 * Returns null if Google credentials are not configured (dev mode).
 */
export async function createCalendarEvent(input: CalendarEventInput): Promise<CalendarEventResult | null> {
  if (!isGoogleConfigured()) {
    console.log('[calendar] CREATE EVENT (stub — no credentials)', input.subject, input.startDate);
    return null;
  }

  const token = await getAccessToken();

  // Calendar all-day events use exclusive end: a 3-day shoot May 15–17
  // needs end = "2026-05-18"
  const exclusiveEnd = new Date(input.endDate + 'T00:00:00Z');
  exclusiveEnd.setUTCDate(exclusiveEnd.getUTCDate() + 1);
  const exclusiveEndStr = exclusiveEnd.toISOString().slice(0, 10);

  const descriptionLines = [
    input.description ?? '',
    input.bookingRef ? `Booking: ${input.bookingRef}` : '',
  ].filter(Boolean).join('\n\n');

  const body = {
    summary: input.subject,
    location: input.location,
    description: descriptionLines || undefined,
    start: { date: input.startDate },
    end: { date: exclusiveEndStr },
    ...(input.attendees && input.attendees.length > 0
      ? { attendees: input.attendees.map((a) => ({ email: a.email, displayName: a.displayName, responseStatus: 'needsAction' })) }
      : {}),
    ...(input.bookingRef
      ? { extendedProperties: { private: { bookingRef: input.bookingRef } } }
      : {}),
  };

  // sendUpdates=all → Google sends invitation emails to all attendees.
  // Without this, the event would be created but no one would be notified.
  const params = input.attendees && input.attendees.length > 0
    ? '?fields=id,htmlLink&sendUpdates=all'
    : '?fields=id,htmlLink';
  const res = await fetch(`${CALENDAR_BASE}${params}`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const errBody = await res.text().catch(() => 'unknown');
    throw new Error(`Calendar CREATE event: ${res.status} ${errBody}`);
  }

  const data = await res.json() as { id: string; htmlLink: string };
  console.log('[calendar] EVENT CREATED', input.bookingRef, data.id);
  return { eventId: data.id, htmlLink: data.htmlLink };
}

/**
 * Update an existing calendar event — used when shoot dates, location, or
 * the attendee roster change in Atelier. Google sends "this event has
 * been updated" notifications to attendees automatically when sendUpdates
 * is set to `all`. Silently no-ops if Google is not configured.
 *
 * Pass only the fields that have changed; omitted fields are left alone
 * server-side via PATCH semantics.
 */
export async function updateCalendarEvent(
  eventId: string,
  input: Partial<CalendarEventInput>,
): Promise<CalendarEventResult | null> {
  if (!isGoogleConfigured()) {
    console.log('[calendar] UPDATE EVENT (stub — no credentials)', eventId);
    return null;
  }
  const token = await getAccessToken();

  const body: Record<string, unknown> = {};
  if (input.subject !== undefined) body.summary = input.subject;
  if (input.location !== undefined) body.location = input.location;
  if (input.description !== undefined) body.description = input.description;
  if (input.startDate) body.start = { date: input.startDate };
  if (input.endDate) {
    const ex = new Date(input.endDate + 'T00:00:00Z');
    ex.setUTCDate(ex.getUTCDate() + 1);
    body.end = { date: ex.toISOString().slice(0, 10) };
  }
  if (input.attendees !== undefined) {
    body.attendees = input.attendees.map((a) => ({
      email: a.email,
      displayName: a.displayName,
      responseStatus: 'needsAction',
    }));
  }

  // PATCH preserves fields we don't include. sendUpdates=all so attendees
  // get the "this event has been updated" email.
  const res = await fetch(`${CALENDAR_BASE}/${eventId}?sendUpdates=all&fields=id,htmlLink`, {
    method: 'PATCH',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const errBody = await res.text().catch(() => 'unknown');
    throw new Error(`Calendar UPDATE event ${eventId}: ${res.status} ${errBody}`);
  }

  const data = await res.json() as { id: string; htmlLink: string };
  console.log('[calendar] EVENT UPDATED', eventId);
  return { eventId: data.id, htmlLink: data.htmlLink };
}

/**
 * Delete a calendar event (e.g. on booking release/cancellation).
 * Silently ignores 404 — safe to call even if the event was already removed.
 */
export async function deleteCalendarEvent(eventId: string): Promise<void> {
  if (!isGoogleConfigured()) {
    console.log('[calendar] DELETE EVENT (stub — no credentials)', eventId);
    return;
  }

  const token = await getAccessToken();
  // sendUpdates=all → Google emails attendees that the event was cancelled.
  const res = await fetch(`${CALENDAR_BASE}/${eventId}?sendUpdates=all`, {
    method: 'DELETE',
    headers: { Authorization: `Bearer ${token}` },
  });

  if (!res.ok && res.status !== 404) {
    const errBody = await res.text().catch(() => 'unknown');
    throw new Error(`Calendar DELETE event ${eventId}: ${res.status} ${errBody}`);
  }

  console.log('[calendar] EVENT DELETED', eventId);
}
