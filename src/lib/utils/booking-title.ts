/**
 * Booking display title — agreed format for list / calendar / board views.
 *
 *   "BOOK-0042 - Oliver Begg - AJE, Resort 26"
 *
 * Multi-artist bookings collapse extras as "+ N more":
 *   "BOOK-0042 - Oliver Begg + Sarah Jones + 2 more - AJE, Resort 26"
 *
 * Designed to read at-a-glance in the calendar bar (where space is tight)
 * and in the list table (where the full string fits comfortably).
 */

export interface BookingTitleParts {
  bookingRef: string | null;
  /** Talent working names. Empty array allowed. */
  talentNames: string[];
  /** Client display name (company falls back to contact name). */
  clientName: string | null;
  /** Booking title (the brief / project name). */
  title: string;
}

export function formatBookingTitle(parts: BookingTitleParts): string {
  const segments: string[] = [];

  if (parts.bookingRef) segments.push(parts.bookingRef);

  if (parts.talentNames.length > 0) {
    segments.push(formatTalentList(parts.talentNames));
  }

  // Client + title share one segment, comma-separated, since they read as
  // a unit ("AJE, Resort 26" = "AJE's Resort 26 shoot").
  const clientTitle = [parts.clientName, parts.title].filter(Boolean).join(', ');
  if (clientTitle) segments.push(clientTitle);

  return segments.join(' - ');
}

/**
 * Format a list of talent names per the agreed multi-artist rule:
 *   - 1 name → "Name"
 *   - 2 names → "Name + Name"
 *   - 3+ names → "Name + Name + N more"
 */
export function formatTalentList(names: string[]): string {
  if (names.length === 0) return '';
  if (names.length === 1) return names[0];
  if (names.length === 2) return `${names[0]} + ${names[1]}`;
  const extra = names.length - 2;
  return `${names[0]} + ${names[1]} + ${extra} more`;
}
