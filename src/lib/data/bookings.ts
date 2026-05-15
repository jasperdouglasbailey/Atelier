import { createClient } from '@/lib/supabase/server';
import { reportDataError } from '@/lib/utils/data-errors';
import { createServiceClient } from '@/lib/supabase/service';
import type { Booking, BookingState, ShootTier } from '@/lib/types/database';
import { STATE_TRANSITIONS, ACTIVE_STATES, QUERY_LIMITS } from '@/lib/utils/constants';
import { emitEvent } from '@/lib/utils/events';
import { logAudit } from '@/lib/utils/audit';
import { getCurrentActor } from '@/lib/utils/actor';

/** Booking row augmented with the joined client record (for list views). */
export type BookingListRow = Booking & {
  client?: { name: string; company: string | null } | null;
  /** First attached talent — used for list/board display. */
  booking_talent?: Array<{ talent: { name: string; discipline: string | null } | null }> | null;
};

/** Booking row with full relations for the detail page. */
export type BookingDetailRow = Booking & {
  client?: { id: string; name: string; company: string | null; email: string | null; abn: string | null; payment_terms_days: number | null } | null;
  brand?: { id: string; name: string } | null;
};

const TABLE = 'atelier_bookings';

// ============================================================
// Queries
// ============================================================

export type BookingListFilters = {
  state?: BookingState;
  stateGroup?: 'active' | 'completed' | 'lost';
  tier?: ShootTier;
  clientId?: string;
  search?: string;
  page?: number;
  pageSize?: number;
  /** When true, also include archived (is_archived=true) rows. Default false. */
  includeArchived?: boolean;
  /** When true, ONLY return archived rows. Used by the "Show archived" tab. */
  archivedOnly?: boolean;
};

export async function listBookings(filters: BookingListFilters = {}): Promise<{
  bookings: BookingListRow[];
  total: number;
  page: number;
  pageSize: number;
}> {
  // Defensive bounds — `page` and `pageSize` flow in from URL params and
  // could be 0, negative, or absurdly large. Clamp before computing the
  // Supabase range so a `?page=-5&pageSize=99999` URL can't break things.
  const page = Math.max(1, Math.floor(filters.page ?? 1));
  const pageSize = Math.min(Math.max(1, Math.floor(filters.pageSize ?? 20)), 100);
  const from = (page - 1) * pageSize;
  const to = from + pageSize - 1;

  const supabase = await createClient();
  let query = supabase
    .from(TABLE)
    .select(
      // The atelier_talent table has working_name (not name) — alias it back to
      // `name` so list/board components can read primaryArtist.name unchanged.
      '*, client:atelier_clients!atelier_bookings_client_id_fkey(name, company), booking_talent:atelier_booking_talent(talent:atelier_talent(name:working_name, discipline))',
      { count: 'exact' },
    )
    .order('created_at', { ascending: false })
    .range(from, to);

  if (filters.state) {
    query = query.eq('state', filters.state);
  } else if (filters.stateGroup === 'active') {
    query = query.in('state', ACTIVE_STATES);
  } else if (filters.stateGroup === 'completed') {
    query = query.eq('state', 'paid');
  } else if (filters.stateGroup === 'lost') {
    query = query.in('state', ['released', 'cancelled', 'written_off']);
  }

  // Archived filter — by default we hide archived rows from active lists.
  // archivedOnly returns ONLY archived rows. includeArchived returns both.
  if (filters.archivedOnly) {
    query = query.eq('is_archived', true);
  } else if (!filters.includeArchived) {
    query = query.eq('is_archived', false);
  }

  if (filters.tier) query = query.eq('tier', filters.tier);
  if (filters.clientId) query = query.eq('client_id', filters.clientId);
  if (filters.search) {
    // Pre-fetch matching client IDs so we can OR on client_id (PostgREST
    // can't filter on embedded foreign-table columns inside .or())
    const { data: matchedClients } = await supabase
      .from('atelier_clients')
      .select('id')
      .or(`name.ilike.%${filters.search}%,company.ilike.%${filters.search}%`)
      .limit(QUERY_LIMITS.bookings_client_search);
    const clientIds = (matchedClients ?? []).map((c: { id: string }) => c.id);

    const orParts = [
      `title.ilike.%${filters.search}%`,
      `booking_ref.ilike.%${filters.search}%`,
    ];
    if (clientIds.length > 0) {
      orParts.push(`client_id.in.(${clientIds.join(',')})`);
    }
    query = query.or(orParts.join(','));
  }

  const { data, count, error } = await query;
  if (error) {
    reportDataError('[bookings] list failed', error);
    return { bookings: [], total: 0, page, pageSize };
  }

  return {
    bookings: (data ?? []) as BookingListRow[],
    total: count ?? 0,
    page,
    pageSize,
  };
}

export async function getBooking(id: string): Promise<BookingDetailRow | null> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from(TABLE)
    .select(
      '*, client:atelier_clients!atelier_bookings_client_id_fkey(id, name, company, email, abn, payment_terms_days), brand:atelier_brands!atelier_bookings_brand_id_fkey(id, name)',
    )
    .eq('id', id)
    .maybeSingle();

  if (error || !data) return null;
  return data as unknown as BookingDetailRow;
}

/**
 * Look up a booking by its public quote token.
 * Used by the /q/[token] client-facing route (no auth required).
 */
/**
 * Public variant — uses service role to bypass RLS.
 * Called from the unauthenticated /q/[token] route; the UUID token is
 * the secret that authorises access to this specific booking.
 */
export async function getBookingByQuoteToken(token: string): Promise<BookingDetailRow | null> {
  const supabase = createServiceClient();
  const { data, error } = await supabase
    .from(TABLE)
    .select(
      '*, client:atelier_clients!atelier_bookings_client_id_fkey(id, name, company, email, abn, payment_terms_days), brand:atelier_brands!atelier_bookings_brand_id_fkey(id, name)',
    )
    .eq('quote_token', token)
    .maybeSingle();

  if (error || !data) return null;
  return data as unknown as BookingDetailRow;
}

// ============================================================
// Mutations
// ============================================================

export type CreateBookingInput = {
  title: string;
  tier: ShootTier;
  client_id?: string | null;
  brand_id?: string | null;
  creative_agency_id?: string | null;
  shoot_location?: string | null;
  shoot_date_notes?: string | null;
  shoot_dates?: string | null; // Postgres daterange string e.g. '[2026-05-15,2026-05-17)'
  call_time?: string | null;
  wrap_time?: string | null;
  talent_count?: number | null;
  /** @deprecated UI removed 2026-05-12; brief parser still writes it. */
  talent_spec?: string | null;
  deliverables_type?: string | null;
  deliverables_count?: number | null;
  usage_duration_months?: number | null;
  usage_notes?: string | null;
  post_production_ownership?: string | null;
  budget_indication?: number | null;
  agency_notes?: string | null;
  brief_raw_text?: string | null;
  usage_media?: string[] | null;
  usage_territory?: string[] | null;
  producer_name?: string | null;
  producer_email?: string | null;
  producer_phone?: string | null;
  confirmation_deadline?: string | null;
  /** Set when the booking was auto-converted from a Gmail message via /inbox.
   *  Enables the "Undo conversion" affordance on the booking detail page. */
  source_gmail_message_id?: string | null;
};

export async function createBooking(input: CreateBookingInput): Promise<Booking | null> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from(TABLE)
    .insert({
      ...input,
      state: 'brief_received' as BookingState,
    })
    .select()
    .single();

  if (error) {
    reportDataError('[bookings] create failed', error);
    return null;
  }

  const booking = data as Booking;

  await emitEvent('booking.created', {
    booking_ref: booking.booking_ref,
    title: booking.title,
    tier: booking.tier,
  }, { bookingId: booking.id, actor: await getCurrentActor() });

  await logAudit({
    userId: await getCurrentActor(),
    action: 'create',
    tableName: TABLE,
    recordId: booking.id,
    newValue: { title: booking.title, tier: booking.tier },
  });

  return booking;
}

export async function updateBooking(
  id: string,
  updates: Partial<Booking>,
): Promise<Booking | null> {
  const supabase = await createClient();

  // Fetch current for audit diff
  const current = await getBooking(id);
  if (!current) return null;

  // Don't allow state changes through generic update — use transitionState
  delete updates.state;
  delete updates.id;
  delete updates.created_at;
  delete updates.booking_ref;

  const { data, error } = await supabase
    .from(TABLE)
    .update(updates)
    .eq('id', id)
    .select()
    .single();

  if (error) {
    reportDataError('[bookings] update failed', error);
    return null;
  }

  await logAudit({
    userId: await getCurrentActor(),
    action: 'update',
    tableName: TABLE,
    recordId: id,
    oldValue: JSON.parse(JSON.stringify(current)) as Record<string, string>,
    newValue: JSON.parse(JSON.stringify(updates)) as Record<string, string>,
  });

  return data as Booking;
}

// ============================================================
// State machine
// ============================================================

export type TransitionResult =
  | { ok: true; booking: Booking }
  | { ok: false; error: string };

export async function transitionState(
  id: string,
  newState: BookingState,
  meta?: { reason?: string; releasedTo?: string; cancellationFee?: number },
): Promise<TransitionResult> {
  const current = await getBooking(id);
  if (!current) return { ok: false, error: 'Booking not found' };

  const allowed = STATE_TRANSITIONS[current.state] ?? [];
  if (!allowed.includes(newState)) {
    return {
      ok: false,
      error: `Cannot transition from "${current.state}" to "${newState}". Allowed: ${allowed.join(', ') || 'none'}`,
    };
  }

  const supabase = await createClient();
  const patch: Record<string, unknown> = { state: newState };

  // Handle exit branches
  if (newState === 'released') {
    patch.release_reason = meta?.reason ?? null;
    patch.released_to = meta?.releasedTo ?? null;
  }
  if (newState === 'cancelled') {
    patch.cancellation_reason = meta?.reason ?? null;
    patch.cancellation_fee = meta?.cancellationFee ?? null;
  }
  if (newState === 'written_off') {
    // Reuses cancellation_reason column to store write-off reason
    patch.cancellation_reason = meta?.reason ?? null;
  }
  // Record when the quote was sent — drives the quote-chase cron's day-counter
  if (newState === 'quote_sent') {
    patch.quote_sent_at = new Date().toISOString();
  }
  // Set OT window when shoot wraps
  if (newState === 'morning_after_check') {
    const windowEnd = new Date();
    windowEnd.setDate(windowEnd.getDate() + 7);
    patch.ot_expenses_window_end = windowEnd.toISOString();
  }
  // Lock OT/expenses and record delivery timestamp when moving to final_delivery
  if (newState === 'final_delivery') {
    patch.ot_expenses_locked = true;
    patch.final_delivery_at = new Date().toISOString();
  }
  // Record when invoice is issued — used to compute DOI (days outstanding invoice)
  if (newState === 'invoice_issued') {
    patch.invoice_issued_at = new Date().toISOString();
  }
  // Record when payment clears — used to compute actual DOI and flag fast/slow payers
  if (newState === 'paid') {
    patch.paid_at = new Date().toISOString();
  }

  const { data, error } = await supabase
    .from(TABLE)
    .update(patch)
    .eq('id', id)
    .eq('state', current.state)
    .select()
    .single();

  if (error) return { ok: false, error: error.message };
  if (!data) return { ok: false, error: 'State changed by another session — please refresh and try again.' };

  const booking = data as Booking;

  // Fire-and-forget: recompute avg_doi_days for the client when payment clears
  if (newState === 'paid' && current.client_id) {
    refreshClientAvgDoi(current.client_id).catch((err) =>
      reportDataError('[transitionState] avg_doi refresh failed', err),
    );
  }

  await emitEvent('booking.state_changed', {
    from: current.state,
    to: newState,
    reason: meta?.reason ?? null,
    booking_ref: booking.booking_ref,
  }, { bookingId: id, actor: await getCurrentActor() });

  await logAudit({
    userId: await getCurrentActor(),
    action: 'state_change',
    tableName: TABLE,
    recordId: id,
    oldValue: { state: current.state },
    newValue: { state: newState, ...meta },
  });

  return { ok: true, booking };
}

// ============================================================
// Client DOI maintenance
// ============================================================

/**
 * Recomputes the client's average days-to-pay (avg_doi_days) from all
 * paid bookings that have both invoice_issued_at and paid_at recorded.
 * Called asynchronously when a booking transitions to "paid".
 */
async function refreshClientAvgDoi(clientId: string): Promise<void> {
  const supabase = await createClient();

  // Fetch all paid bookings for this client with both timestamps
  const { data, error } = await supabase
    .from(TABLE)
    .select('invoice_issued_at, paid_at')
    .eq('client_id', clientId)
    .eq('state', 'paid')
    .not('invoice_issued_at', 'is', null)
    .not('paid_at', 'is', null);

  if (error || !data || data.length === 0) return;

  const rows = data as { invoice_issued_at: string; paid_at: string }[];

  const totalDays = rows.reduce((sum, r) => {
    const doi = Math.max(
      0,
      Math.round(
        (new Date(r.paid_at).getTime() - new Date(r.invoice_issued_at).getTime()) / 86_400_000,
      ),
    );
    return sum + doi;
  }, 0);

  const avgDoi = Math.round(totalDays / rows.length);

  await supabase
    .from('atelier_clients')
    .update({ avg_doi_days: avgDoi })
    .eq('id', clientId);
}

// ============================================================
// Dashboard queries
// ============================================================

export async function getBookingCounts(): Promise<Record<string, number>> {
  // SQL-side aggregation — avoids pulling every booking row into Node.js just
  // to count them. Supabase doesn't expose GROUP BY through its query builder
  // so we use a raw RPC shim. The function is defined in migration 0028.
  const supabase = await createClient();
  const { data, error } = await supabase.rpc('get_booking_state_counts');

  if (error) {
    // Fallback to JS aggregation so the dashboard doesn't break if the RPC
    // doesn't exist yet (e.g. pre-migration local dev).
    const { data: fallback } = await supabase.from(TABLE).select('state').eq('is_archived', false);
    const counts: Record<string, number> = {};
    for (const row of (fallback ?? []) as { state: string }[]) {
      counts[row.state] = (counts[row.state] ?? 0) + 1;
    }
    return counts;
  }

  const counts: Record<string, number> = {};
  for (const row of (data ?? []) as { state: string; count: number }[]) {
    counts[row.state] = Number(row.count);
  }
  return counts;
}

// Attention items: bookings that need Jasper's input, ordered by urgency.
// States and their implied action:
//   morning_after_check → selects/OT review needed (highest urgency — time-sensitive)
//   brief_received      → new brief in, needs parsing
//   brief_parsed        → brief parsed, needs quote drafted
//   quote_drafted       → quote ready to send to client
export type AttentionItem = {
  id: string;
  booking_ref: string | null;
  title: string;
  state: BookingState;
  client_company: string | null;
  client_name: string | null;
  updated_at: string;
  ot_expenses_window_end: string | null;
  ot_expenses_locked: boolean;
};

const ATTENTION_STATES: BookingState[] = [
  'morning_after_check',
  'brief_received',
  'brief_parsed',
  'quote_drafted',
];

export async function getAttentionItems(): Promise<AttentionItem[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from(TABLE)
    .select('id, booking_ref, title, state, updated_at, ot_expenses_window_end, ot_expenses_locked, client:atelier_clients!atelier_bookings_client_id_fkey(name, company)')
    .in('state', ATTENTION_STATES)
    .order('updated_at', { ascending: false })
    .limit(20);

  if (error || !data) return [];

  // Sort by urgency: morning_after_check first, then by updated_at descending
  const stateOrder = Object.fromEntries(ATTENTION_STATES.map((s, i) => [s, i]));
  const rows = (data as unknown as Array<{
    id: string; booking_ref: string | null; title: string; state: BookingState; updated_at: string;
    ot_expenses_window_end: string | null; ot_expenses_locked: boolean;
    client: { name: string; company: string | null } | null;
  }>);

  rows.sort((a, b) => (stateOrder[a.state] ?? 99) - (stateOrder[b.state] ?? 99));

  return rows.map((r) => ({
    id: r.id,
    booking_ref: r.booking_ref,
    title: r.title,
    state: r.state,
    client_company: r.client?.company ?? null,
    client_name: r.client?.name ?? null,
    updated_at: r.updated_at,
    ot_expenses_window_end: r.ot_expenses_window_end ?? null,
    ot_expenses_locked: r.ot_expenses_locked ?? false,
  }));
}

/**
 * Returns confirmed/pre-prod/live bookings whose shoot dates haven't ended yet.
 *
 * Previous implementation didn't filter by date at all — it just sorted by
 * shoot_dates asc and returned the first 10. Jasper hit this on the dashboard:
 * the "Upcoming shoots" panel was showing bookings from weeks ago because they
 * were stuck in `quote_confirmed` / `pre_production` without ever advancing
 * to `morning_after_check`.
 *
 * Common-sense fix: "upcoming" means in the future. Parse each booking's
 * daterange and keep only those whose inclusive end-date >= today. Default
 * limit 4 (was 10) since the dashboard panel only renders 4 anyway.
 */
export async function getUpcomingShoots(limit = 4): Promise<Booking[]> {
  const supabase = await createClient();

  // Over-fetch a window so we don't accidentally exclude truly-upcoming bookings
  // when the early matches are all in the past. 30 covers months of past
  // unadvanced bookings without paginating.
  const { data, error } = await supabase
    .from(TABLE)
    .select('*')
    .in('state', ['quote_confirmed', 'pre_production', 'shoot_live'])
    .not('shoot_dates', 'is', null)
    .order('shoot_dates', { ascending: true })
    .limit(30);

  if (error || !data) return [];

  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const todayISO = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;

  // Postgres daterange is '[start,end)' — end is EXCLUSIVE. Parse the raw
  // string and treat the day BEFORE `end` as the final shoot day.
  const upcoming = (data as Booking[]).filter((b) => {
    if (!b.shoot_dates) return false;
    const m = b.shoot_dates.match(/^[\[(](\d{4}-\d{2}-\d{2}),(\d{4}-\d{2}-\d{2})[\])]$/);
    if (!m) return false;
    const endExclusive = m[2]!;
    // A booking ends "yesterday" when its daterange end (exclusive) <= today's ISO.
    // i.e. if end='2026-05-15' and today='2026-05-15', the shoot was 14 May,
    // which is already past — filter it out.
    return endExclusive > todayISO;
  });

  return upcoming.slice(0, limit);
}

// ============================================================
// Overdue invoice tracking
// ============================================================

export type OverdueInvoice = {
  id: string;
  booking_ref: string | null;
  title: string;
  grand_total: number;
  invoice_issued_at: string;
  days_outstanding: number;
  payment_terms_days: number;
  is_overdue: boolean;
  client_id: string | null;
  client_name: string | null;
  client_company: string | null;
};

/**
 * Fetches all unpaid invoiced bookings (state = invoice_issued) and
 * annotates each with days outstanding and whether it's overdue relative
 * to the client's payment_terms_days (defaults to 30 days if unset).
 *
 * Only returns bookings where the invoice was issued at least 1 day ago.
 */
export async function getOverdueInvoices(): Promise<OverdueInvoice[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from(TABLE)
    .select(
      'id, booking_ref, title, grand_total, invoice_issued_at, client_id, client:atelier_clients!atelier_bookings_client_id_fkey(name, company, payment_terms_days)',
    )
    .eq('state', 'invoice_issued')
    .not('invoice_issued_at', 'is', null)
    .order('invoice_issued_at', { ascending: true });

  if (error || !data) return [];

  const now = Date.now();
  const rows = data as unknown as Array<{
    id: string;
    booking_ref: string | null;
    title: string;
    grand_total: number;
    invoice_issued_at: string;
    client_id: string | null;
    client: { name: string; company: string | null; payment_terms_days: number | null } | null;
  }>;

  return rows
    .map((r): OverdueInvoice => {
      const issuedMs = new Date(r.invoice_issued_at).getTime();
      const daysOutstanding = Math.max(0, Math.round((now - issuedMs) / 86_400_000));
      const paymentTerms = r.client?.payment_terms_days ?? 30;
      return {
        id: r.id,
        booking_ref: r.booking_ref,
        title: r.title,
        grand_total: r.grand_total,
        invoice_issued_at: r.invoice_issued_at,
        days_outstanding: daysOutstanding,
        payment_terms_days: paymentTerms,
        is_overdue: daysOutstanding > paymentTerms,
        client_id: r.client_id,
        client_name: r.client?.name ?? null,
        client_company: r.client?.company ?? null,
      };
    })
    // Surface overdue first, then sort by age descending within each group
    .sort((a, b) => {
      if (a.is_overdue !== b.is_overdue) return a.is_overdue ? -1 : 1;
      return b.days_outstanding - a.days_outstanding;
    });
}

// ============================================================
// Hard delete + corpus archival
// ============================================================

/**
 * Map a booking's terminal state to a corpus outcome value.
 *
 * won              → reached 'paid' or 'released' (shoot happened, invoiced)
 * lost_pre_quote   → cancelled before a quote was ever sent to the client
 * lost_post_quote  → cancelled after quote_sent (client saw the number and walked)
 * cancelled        → any other terminal state we don't have a sharper label for
 */
/**
 * Map a booking's terminal state to a corpus outcome value. Exported
 * for unit testing (also used by deleteBookingWithCorpus internally).
 */
export function deriveOutcome(
  state: BookingState,
  quoteWasSent: boolean,
): 'won' | 'lost_pre_quote' | 'lost_post_quote' | 'cancelled' {
  if (state === 'paid' || state === 'released') return 'won';
  if (state === 'cancelled' || state === 'written_off') return quoteWasSent ? 'lost_post_quote' : 'lost_pre_quote';
  return 'cancelled';
}

/**
 * Compute a stable sha256 hex digest of a string.
 * Works in the Node.js runtime (no browser crypto needed here — this is
 * server-only data-layer code).
 */
async function sha256hex(value: string): Promise<string> {
  const { createHash } = await import('crypto');
  return createHash('sha256').update(value).digest('hex');
}

/**
 * Hard-delete a booking and write one anonymised row to atelier_corpus_bookings.
 *
 * Only valid for bookings in terminal states: paid, released, cancelled.
 * Returns true on success, false on any error.
 *
 * Cascade behaviour (FK ON DELETE CASCADE) automatically removes:
 *   atelier_booking_talent, atelier_booking_crew, atelier_fee_lines,
 *   atelier_approval_requests, atelier_events (where booking_id is FK'd)
 */
export async function deleteBookingWithCorpus(bookingId: string): Promise<boolean> {
  const serviceClient = createServiceClient();

  // 1. Fetch the booking and its first talent assignment.
  // Use the service client so RLS cannot block the read — authorisation is
  // already enforced by the calling server action (getCurrentActor check).
  const { data: booking, error: fetchError } = await serviceClient
    .from(TABLE)
    .select(
      '*, booking_talent:atelier_booking_talent(talent_id)',
    )
    .eq('id', bookingId)
    .maybeSingle();

  if (fetchError || !booking) {
    reportDataError('[bookings] deleteWithCorpus — fetch failed', fetchError ?? new Error('not found'));
    return false;
  }

  const b = booking as Booking & {
    booking_talent?: Array<{ talent_id: string }> | null;
  };

  // Guard: only allow deletion of terminal states
  const TERMINAL: BookingState[] = ['paid', 'released', 'cancelled', 'written_off'];
  if (!TERMINAL.includes(b.state)) {
    reportDataError(
      '[bookings] deleteWithCorpus — refused',
      new Error(`Booking ${bookingId} is in state '${b.state}'; only terminal bookings can be deleted`),
    );
    return false;
  }

  // 2. Determine whether a quote was ever sent (to pick the right outcome)
  //    We check the audit log for a 'transition' row whose new_value contains 'quote_sent'.
  const { data: auditRows } = await serviceClient
    .from('atelier_audit_log')
    .select('new_value')
    .eq('record_id', bookingId)
    .eq('action', 'transition')
    .limit(QUERY_LIMITS.booking_events);

  const quoteWasSent = (auditRows ?? []).some((row: { new_value: unknown }) => {
    const nv = row.new_value as Record<string, unknown> | null;
    return nv?.to === 'quote_sent' || nv?.state === 'quote_sent';
  });

  const outcome = deriveOutcome(b.state, quoteWasSent);

  // 3. Build corpus row — hash PII, drop exact dates
  const clientHash = b.client_id ? await sha256hex(b.client_id) : null;
  const primaryTalentId = b.booking_talent?.[0]?.talent_id ?? null;
  const talentHash = primaryTalentId ? await sha256hex(primaryTalentId) : null;

  const shootYearMonth = b.shoot_dates
    ? b.shoot_dates.replace(/^\[/, '').slice(0, 7) // '[2026-05-15,...' → '2026-05'
    : null;

  const corpusRow = {
    client_hash: clientHash,
    talent_hash: talentHash,
    tier: b.tier,
    day_rate: null as number | null,          // day rate lives on booking_talent; skip for now
    deliverable_count: b.deliverables_count,
    usage_media: (b.usage_media ?? []) as string[],
    usage_territory: (b.usage_territory ?? []) as string[],
    usage_duration_months: b.usage_duration_months,
    grand_total: b.grand_total,
    shoot_year_month: shootYearMonth,
    outcome,
    source_booking_state: b.state,
  };

  // 4. Write corpus row via service client (bypasses RLS insert restriction)
  const { error: corpusError } = await serviceClient
    .from('atelier_corpus_bookings')
    .insert(corpusRow);

  if (corpusError) {
    // Non-fatal: corpus write failure must not block the delete.
    // Absorb any throw from reportDataError (it throws in dev mode).
    try { reportDataError('[bookings] corpus insert failed', corpusError); } catch { /* absorbed */ }
  }

  // 5. Audit the deletion before it happens
  await logAudit({
    userId: await getCurrentActor(),
    action: 'hard_delete',
    tableName: TABLE,
    recordId: bookingId,
    oldValue: {
      title: b.title,
      booking_ref: b.booking_ref,
      state: b.state,
      outcome,
    } as unknown as import('@/lib/types/database').Json,
    newValue: null,
  });

  // 6. Hard delete — FK cascades handle child rows
  const { error: deleteError } = await serviceClient
    .from(TABLE)
    .delete()
    .eq('id', bookingId);

  if (deleteError) {
    reportDataError('[bookings] deleteWithCorpus — delete failed', deleteError);
    return false;
  }

  return true;
}
