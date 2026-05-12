export function formatCurrency(amount: number, currency = 'AUD'): string {
  return new Intl.NumberFormat('en-AU', { style: 'currency', currency }).format(amount);
}

export function formatDate(date: string | Date): string {
  return new Intl.DateTimeFormat('en-AU', { dateStyle: 'medium' }).format(new Date(date));
}

export function formatDateTime(date: string | Date): string {
  return new Intl.DateTimeFormat('en-AU', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(date));
}

/**
 * Format a Postgres `daterange` literal as a human-readable date span.
 * Postgres ranges have an exclusive end bound, so we subtract a day for
 * display ("12 Jun – 13 Jun" reads better than "12 Jun – 14 Jun" when the
 * shoot was actually a two-day Mon-Tue).
 */
export function formatShootDates(range: string | null): string | null {
  if (!range) return null;
  const m = range.match(/^[\[(](\d{4}-\d{2}-\d{2})?,(\d{4}-\d{2}-\d{2})?[\])]$/);
  if (!m || !m[1]) return null;
  const start = m[1];
  if (m[2]) {
    const end = new Date(m[2] + 'T00:00:00Z');
    end.setUTCDate(end.getUTCDate() - 1);
    const endStr = end.toISOString().slice(0, 10);
    return endStr === start ? formatDate(start) : `${formatDate(start)} – ${formatDate(endStr)}`;
  }
  return formatDate(start);
}

export function slugify(str: string): string {
  return str.toLowerCase().replace(/\s+/g, '_');
}
