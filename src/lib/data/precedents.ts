/**
 * Corpus + active-booking precedent lookups.
 *
 * Two data sources:
 *   1. atelier_corpus_bookings — anonymised, hashed client/talent IDs.
 *      Lives forever. Drives long-tail "what's normal" questions.
 *   2. atelier_bookings + atelier_booking_talent + atelier_fee_lines —
 *      live, identifiable. Drives "what did THIS client / THIS talent
 *      pay last time" questions.
 *
 * Sample-size doctrine: n<3 returns confidence='low'. Callers should
 * either suppress the signal or render it muted. We never fabricate
 * confidence on thin data.
 */

import { createClient } from '@/lib/supabase/server';
import { reportDataError } from '@/lib/utils/data-errors';
import { createHash } from 'crypto';

export type RateBand = {
  count: number;
  min: number;
  median: number;
  max: number;
  avg: number;
  confidence: 'low' | 'ok' | 'strong';
};

function bandStats(rates: number[]): RateBand | null {
  if (rates.length === 0) return null;
  const sorted = [...rates].sort((a, b) => a - b);
  const sum = sorted.reduce((s, n) => s + n, 0);
  const mid = Math.floor(sorted.length / 2);
  const median = sorted.length % 2 === 0
    ? (sorted[mid - 1] + sorted[mid]) / 2
    : sorted[mid];
  // Confidence buckets per master doctrine: <3 low, 3-9 ok, ≥10 strong
  const confidence: RateBand['confidence'] = sorted.length >= 10 ? 'strong' : sorted.length >= 3 ? 'ok' : 'low';
  return {
    count: sorted.length,
    min: sorted[0],
    median,
    max: sorted[sorted.length - 1],
    avg: sum / sorted.length,
    confidence,
  };
}

function sha256hex(value: string): string {
  return createHash('sha256').update(value).digest('hex');
}

// ============================================================
// Talent rate precedents
// ============================================================

/**
 * Day-rate distribution for a specific talent across past bookings,
 * optionally filtered to a tier. Pulls from live booking_talent rows
 * (including completed bookings — corpus is rare since hard-delete is
 * rare). Returns null if no data.
 */
export async function getTalentRateBand(input: {
  talentId: string;
  tier?: string;
}): Promise<RateBand | null> {
  const supabase = await createClient();
  let query = supabase
    .from('atelier_booking_talent')
    .select('day_rate, booking:atelier_bookings!inner(tier, state)')
    .eq('talent_id', input.talentId)
    .not('day_rate', 'is', null);

  if (input.tier) {
    query = query.eq('booking.tier', input.tier);
  }

  const { data, error } = await query;
  if (error) {
    reportDataError('[precedents] talent rates', error);
    return null;
  }

  const rates = (data ?? [])
    .map((r: { day_rate: number | null }) => r.day_rate)
    .filter((n): n is number => n != null && n > 0);

  return bandStats(rates);
}

// ============================================================
// Client rate precedents
// ============================================================

/**
 * What this client has historically paid (grand_total) for a given
 * tier. Useful for the "rate delta vs client history" signal.
 */
export async function getClientRateBand(input: {
  clientId: string;
  tier?: string;
}): Promise<RateBand | null> {
  const supabase = await createClient();
  let query = supabase
    .from('atelier_bookings')
    .select('grand_total, tier, state')
    .eq('client_id', input.clientId)
    .gt('grand_total', 0);

  if (input.tier) query = query.eq('tier', input.tier);

  const { data, error } = await query;
  if (error) {
    reportDataError('[precedents] client rates', error);
    return null;
  }

  const totals = (data ?? [])
    .map((r: { grand_total: number }) => r.grand_total)
    .filter((n): n is number => n != null && n > 0);

  return bandStats(totals);
}

// ============================================================
// Talent-client prior work signal
// ============================================================

/**
 * Has this talent worked with this client before? Returns the most
 * recent N bookings if so. Drives the "talent-client prior work" signal.
 */
export async function getTalentClientHistory(input: {
  talentId: string;
  clientId: string;
  limit?: number;
}): Promise<Array<{
  bookingId: string;
  bookingRef: string | null;
  title: string;
  shootDateNotes: string | null;
  state: string;
  dayRate: number | null;
  grandTotal: number | null;
}>> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from('atelier_booking_talent')
    .select('day_rate, booking:atelier_bookings!inner(id, booking_ref, title, shoot_date_notes, state, grand_total, client_id, created_at)')
    .eq('talent_id', input.talentId)
    .eq('booking.client_id', input.clientId)
    .order('created_at', { foreignTable: 'booking', ascending: false })
    .limit(input.limit ?? 5);

  if (error) {
    reportDataError('[precedents] talent-client history', error);
    return [];
  }

  type Row = {
    day_rate: number | null;
    booking: {
      id: string;
      booking_ref: string | null;
      title: string;
      shoot_date_notes: string | null;
      state: string;
      grand_total: number | null;
    } | null;
  };

  return ((data ?? []) as unknown as Row[])
    .filter((r): r is Row & { booking: NonNullable<Row['booking']> } => r.booking != null)
    .map((r) => ({
      bookingId: r.booking.id,
      bookingRef: r.booking.booking_ref,
      title: r.booking.title,
      shootDateNotes: r.booking.shoot_date_notes,
      state: r.booking.state,
      dayRate: r.day_rate,
      grandTotal: r.booking.grand_total,
    }));
}

// ============================================================
// Repeat-client behavioural signal (corpus-backed)
// ============================================================

/**
 * Has this client appeared in the corpus before? If so, return the
 * outcome distribution — won/lost — and historical median rate.
 *
 * This uses the corpus (anonymised, hashed) deliberately: even after
 * a hard delete, the pattern survives. For live identified data, prefer
 * getClientRateBand.
 */
export async function getClientCorpusSignal(input: {
  clientId: string;
  tier?: string;
}): Promise<{
  count: number;
  wonCount: number;
  lostCount: number;
  medianGrandTotal: number | null;
  confidence: RateBand['confidence'];
} | null> {
  const supabase = await createClient();
  const clientHash = sha256hex(input.clientId);

  let query = supabase
    .from('atelier_corpus_bookings')
    .select('outcome, grand_total, tier')
    .eq('client_hash', clientHash);

  if (input.tier) query = query.eq('tier', input.tier);

  const { data, error } = await query;
  if (error) {
    reportDataError('[precedents] client corpus', error);
    return null;
  }

  const rows = data ?? [];
  if (rows.length === 0) return null;

  const wonCount = rows.filter((r) => r.outcome === 'won').length;
  const lostCount = rows.filter((r) => r.outcome === 'lost_pre_quote' || r.outcome === 'lost_post_quote').length;
  const totals = rows
    .map((r: { grand_total: number | null }) => r.grand_total)
    .filter((n): n is number => n != null && n > 0)
    .sort((a, b) => a - b);
  const medianGrandTotal = totals.length === 0
    ? null
    : totals.length % 2 === 0
      ? (totals[totals.length / 2 - 1] + totals[totals.length / 2]) / 2
      : totals[Math.floor(totals.length / 2)];

  const confidence: RateBand['confidence'] = rows.length >= 10 ? 'strong' : rows.length >= 3 ? 'ok' : 'low';

  return { count: rows.length, wonCount, lostCount, medianGrandTotal, confidence };
}
