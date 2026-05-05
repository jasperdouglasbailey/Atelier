import { createClient } from '@/lib/supabase/server';
import type { Booking, BookingState, ShootTier } from '@/lib/types/database';
import { STATE_TRANSITIONS, ACTIVE_STATES } from '@/lib/utils/constants';
import { emitEvent } from '@/lib/utils/events';
import { logAudit } from '@/lib/utils/audit';
import { getCurrentActor } from '@/lib/utils/actor';

/** Booking row augmented with the joined client record (for list views). */
export type BookingListRow = Booking & {
  client?: { name: string; company: string | null } | null;
};

/** Booking row with full relations for the detail page. */
export type BookingDetailRow = Booking & {
  client?: { id: string; name: string; company: string | null } | null;
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
};

export async function listBookings(filters: BookingListFilters = {}): Promise<{
  bookings: BookingListRow[];
  total: number;
  page: number;
  pageSize: number;
}> {
  const page = filters.page ?? 1;
  const pageSize = filters.pageSize ?? 20;
  const from = (page - 1) * pageSize;
  const to = from + pageSize - 1;

  const supabase = await createClient();
  let query = supabase
    .from(TABLE)
    .select(
      '*, client:atelier_clients!atelier_bookings_client_id_fkey(name, company)',
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
    query = query.in('state', ['released', 'cancelled']);
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
      .limit(50);
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
    console.error('[bookings] list failed', error.message);
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
      '*, client:atelier_clients!atelier_bookings_client_id_fkey(id, name, company), brand:atelier_brands!atelier_bookings_brand_id_fkey(id, name)',
    )
    .eq('id', id)
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
  talent_count?: number | null;
  talent_spec?: string | null;
  deliverables_type?: string | null;
  deliverables_count?: number | null;
  usage_duration_months?: number | null;
  usage_notes?: string | null;
  post_production_ownership?: string | null;
  budget_indication?: number | null;
  agency_notes?: string | null;
  brief_raw_text?: string | null;
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
    console.error('[bookings] create failed', error.message);
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
    console.error('[bookings] update failed', error.message);
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

  const { data, error } = await supabase
    .from(TABLE)
    .update(patch)
    .eq('id', id)
    .select()
    .single();

  if (error) return { ok: false, error: error.message };

  const booking = data as Booking;

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
// Dashboard queries
// ============================================================

export async function getBookingCounts(): Promise<Record<string, number>> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from(TABLE)
    .select('state');

  if (error) return {};

  const counts: Record<string, number> = {};
  for (const row of (data ?? []) as { state: string }[]) {
    counts[row.state] = (counts[row.state] ?? 0) + 1;
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
    .select('id, booking_ref, title, state, updated_at, client:atelier_clients!atelier_bookings_client_id_fkey(name, company)')
    .in('state', ATTENTION_STATES)
    .order('updated_at', { ascending: false })
    .limit(20);

  if (error || !data) return [];

  // Sort by urgency: morning_after_check first, then by updated_at descending
  const stateOrder = Object.fromEntries(ATTENTION_STATES.map((s, i) => [s, i]));
  const rows = (data as unknown as Array<{
    id: string; booking_ref: string | null; title: string; state: BookingState; updated_at: string;
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
  }));
}

export async function getUpcomingShoots(days = 14): Promise<Booking[]> {
  const supabase = await createClient();
  const now = new Date().toISOString().slice(0, 10);
  const future = new Date();
  future.setDate(future.getDate() + days);

  const { data, error } = await supabase
    .from(TABLE)
    .select('*')
    .in('state', ['quote_confirmed', 'pre_production', 'shoot_live'])
    .not('shoot_dates', 'is', null)
    .order('shoot_dates', { ascending: true })
    .limit(10);

  if (error) return [];
  return (data ?? []) as Booking[];
}
