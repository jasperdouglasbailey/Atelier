/**
 * Google Calendar Integration Stub
 *
 * Handles: shoot day events, crew confirmations, deadline reminders.
 *
 * Setup: shares OAuth credentials with Gmail and Drive — see google-auth.ts.
 * The `calendar.events` scope (NOT `calendar.readonly` or full `calendar`)
 * limits the app to creating/updating events on Jasper's primary calendar.
 *
 * Real implementation will use:
 *   - Calendar REST API: https://www.googleapis.com/calendar/v3/calendars/primary/events
 *   - Event resource format (start/end with timeZone, attendees, location)
 *   - sendUpdates=all to email invites to attendees
 */

import { isGoogleConfigured } from './google-auth';

export interface CalendarEventInput {
  subject: string;
  start: string;       // ISO datetime
  end: string;
  location?: string;
  attendees?: string[];
  body?: string;
  bookingRef?: string;
  timeZone?: string;   // e.g. 'Australia/Sydney'. Defaults to Sydney.
}

/** Create a calendar event (e.g. shoot day, recce, post review). */
export async function createCalendarEvent(input: CalendarEventInput): Promise<{ eventId: string }> {
  if (!isGoogleConfigured()) {
    console.log('[calendar] CREATE EVENT (stub — no credentials)', input.subject, input.start);
    return { eventId: `event-stub-${Date.now()}` };
  }

  // TODO: POST to https://www.googleapis.com/calendar/v3/calendars/primary/events
  // ?sendUpdates=all
  // body: {
  //   summary: input.subject,
  //   description: input.body,
  //   location: input.location,
  //   start: { dateTime: input.start, timeZone: input.timeZone ?? 'Australia/Sydney' },
  //   end:   { dateTime: input.end,   timeZone: input.timeZone ?? 'Australia/Sydney' },
  //   attendees: input.attendees?.map(email => ({ email })),
  //   extendedProperties: { private: { bookingRef: input.bookingRef } },
  // }
  console.log('[calendar] CREATE EVENT (not yet implemented)', input.subject);
  return { eventId: `event-stub-${Date.now()}` };
}
