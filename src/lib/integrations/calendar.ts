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
    ...(input.bookingRef
      ? { extendedProperties: { private: { bookingRef: input.bookingRef } } }
      : {}),
  };

  const res = await fetch(`${CALENDAR_BASE}?fields=id,htmlLink`, {
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
 * Delete a calendar event (e.g. on booking release/cancellation).
 * Silently ignores 404 — safe to call even if the event was already removed.
 */
export async function deleteCalendarEvent(eventId: string): Promise<void> {
  if (!isGoogleConfigured()) {
    console.log('[calendar] DELETE EVENT (stub — no credentials)', eventId);
    return;
  }

  const token = await getAccessToken();
  const res = await fetch(`${CALENDAR_BASE}/${eventId}`, {
    method: 'DELETE',
    headers: { Authorization: `Bearer ${token}` },
  });

  if (!res.ok && res.status !== 404) {
    const errBody = await res.text().catch(() => 'unknown');
    throw new Error(`Calendar DELETE event ${eventId}: ${res.status} ${errBody}`);
  }

  console.log('[calendar] EVENT DELETED', eventId);
}
