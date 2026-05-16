import { createClient } from '@/lib/supabase/server';
import { reportDataError } from '@/lib/utils/data-errors';
import { createServiceClient } from '@/lib/supabase/service';
import type { QuoteVersion, FeeLine, FeeLineType } from '@/lib/types/database';
import { computeQuoteTotals } from '@/lib/utils/fee-engine';
import { logAudit } from '@/lib/utils/audit';
import { emitEvent } from '@/lib/utils/events';
import { getCurrentActor } from '@/lib/utils/actor';

const QUOTE_TABLE = 'atelier_quote_versions';
const LINE_TABLE = 'atelier_fee_lines';

// ============================================================
// Quote versions
// ============================================================

export async function listQuoteVersions(bookingId: string): Promise<QuoteVersion[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from(QUOTE_TABLE)
    .select('*')
    .eq('booking_id', bookingId)
    .order('version', { ascending: false });

  if (error) { reportDataError('[quotes] list versions', error); return []; }
  return (data ?? []) as QuoteVersion[];
}

export async function getLatestQuoteVersion(bookingId: string): Promise<QuoteVersion | null> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from(QUOTE_TABLE)
    .select('*')
    .eq('booking_id', bookingId)
    .order('version', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error || !data) return null;
  return data as QuoteVersion;
}

/**
 * "Active" quote version — the one a print template or the public client
 * viewer should render. Distinct from `getLatestQuoteVersion`, which
 * always returns the highest version number even if it's an empty draft.
 *
 * Selection order:
 *   1. The most recent version that was sent (`sent_at IS NOT NULL`) —
 *      this is the version the client actually has in their inbox.
 *   2. The most recent version with content (`grand_total > 0`).
 *   3. Truly latest, fallback so callers never see null when any version
 *      exists.
 *
 * Audit AUDIT-2026-05-15 caught the bug: BOOK-0001 had a V3 empty draft
 * sitting on top of a populated V1/V2. The print/quote template called
 * getLatestQuoteVersion → got V3 → rendered "No fee lines have been
 * added to this quote yet." with the booking still showing $6,758 in
 * the detail header. This function is the fix.
 *
 * QuoteBuilder still uses getLatestQuoteVersion so a freshly-created
 * empty V3 is editable; only print + public viewer routes use this.
 */
export async function getActiveQuoteVersion(bookingId: string): Promise<QuoteVersion | null> {
  const supabase = await createClient();

  // 1. Most recent sent version
  const sent = await supabase
    .from(QUOTE_TABLE)
    .select('*')
    .eq('booking_id', bookingId)
    .not('sent_at', 'is', null)
    .order('sent_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (sent.data) return sent.data as QuoteVersion;

  // 2. Most recent populated version (totals computed → has line content)
  const populated = await supabase
    .from(QUOTE_TABLE)
    .select('*')
    .eq('booking_id', bookingId)
    .gt('grand_total', 0)
    .order('version', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (populated.data) return populated.data as QuoteVersion;

  // 3. Truly-latest, fallback so empty-quote bookings still render
  return getLatestQuoteVersion(bookingId);
}

/** Fee lines belonging to the active (print/public-facing) quote version. */
export async function listFeeLinesForActiveQuote(bookingId: string): Promise<FeeLine[]> {
  const active = await getActiveQuoteVersion(bookingId);
  if (!active) return [];
  return listFeeLines(active.id);
}

export async function createQuoteVersion(bookingId: string, notes?: string): Promise<QuoteVersion | null> {
  const supabase = await createClient();

  // Determine next version number
  const latest = await getLatestQuoteVersion(bookingId);
  const nextVersion = (latest?.version ?? 0) + 1;

  const { data, error } = await supabase
    .from(QUOTE_TABLE)
    .insert({
      booking_id: bookingId,
      version: nextVersion,
      status: 'draft',
      subtotal: 0,
      total_asf: 0,
      total_gst: 0,
      total_super: 0,
      grand_total: 0,
      currency: 'AUD',
      notes: notes ?? null,
    })
    .select()
    .single();

  if (error) { reportDataError('[quotes] create version', error); return null; }

  await emitEvent('quote.version_created', {
    booking_id: bookingId,
    version: nextVersion,
  }, { bookingId, actor: await getCurrentActor() });

  return data as QuoteVersion;
}

/** Recalculate quote totals from its fee lines and update both quote_version and booking. */
export async function recalcQuoteTotals(quoteVersionId: string): Promise<QuoteVersion | null> {
  const supabase = await createClient();

  // Fetch all lines for this quote version
  const { data: lines, error: linesErr } = await supabase
    .from(LINE_TABLE)
    .select('*')
    .eq('quote_version_id', quoteVersionId)
    .order('sort_order', { ascending: true });

  if (linesErr) { reportDataError('[quotes] fetch lines for recalc', linesErr); return null; }

  const feeLines = (lines ?? []) as FeeLine[];
  const totals = computeQuoteTotals(feeLines);

  // Update quote version totals
  const { data: qv, error: qvErr } = await supabase
    .from(QUOTE_TABLE)
    .update({
      subtotal: totals.subtotal,
      total_asf: totals.totalAsf,
      total_gst: totals.totalGst,
      total_super: totals.totalSuper,
      grand_total: totals.grandTotal,
    })
    .eq('id', quoteVersionId)
    .select()
    .single();

  if (qvErr) { reportDataError('[quotes] update totals', qvErr); return null; }

  const quoteVersion = qv as QuoteVersion;

  // Also update the booking summary totals
  await supabase
    .from('atelier_bookings')
    .update({
      subtotal: totals.subtotal,
      total_asf: totals.totalAsf,
      total_gst: totals.totalGst,
      grand_total: totals.grandTotal,
    })
    .eq('id', quoteVersion.booking_id);

  return quoteVersion;
}

// ============================================================
// Fee lines
// ============================================================

export async function getFeeLine(id: string): Promise<FeeLine | null> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from(LINE_TABLE)
    .select('*')
    .eq('id', id)
    .maybeSingle();
  if (error || !data) return null;
  return data as FeeLine;
}

export async function listFeeLines(quoteVersionId: string): Promise<FeeLine[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from(LINE_TABLE)
    .select('*')
    .eq('quote_version_id', quoteVersionId)
    .order('sort_order', { ascending: true });

  if (error) { reportDataError('[quotes] list lines', error); return []; }
  return (data ?? []) as FeeLine[];
}

export async function listFeeLinesForBooking(bookingId: string): Promise<FeeLine[]> {
  const latest = await getLatestQuoteVersion(bookingId);
  if (!latest) return [];

  return listFeeLines(latest.id);
}

export type CreateFeeLineInput = {
  quote_version_id: string;
  booking_id: string;
  line_type: FeeLineType;
  description: string;
  talent_id?: string | null;
  crew_id?: string | null;
  quantity: number;
  unit_price: number;
  subtotal: number;
  /** Optional: actual cost when different from billed `subtotal`. */
  cost_subtotal?: number | null;
  asf_rate: number;
  asf_amount: number;
  is_gst_exempt: boolean;
  is_super_bearing: boolean;
  super_rate_charged?: number;
  super_rate_paid?: number;
  is_commissionable: boolean;
  commission_rate?: number;
  sort_order?: number;
  notes?: string | null;
  is_artist_reimbursement?: boolean;
};

/**
 * Insert a fee line. The auth-context client reads sort_order (RLS allows
 * owner/partner to read all rows), then the service client writes — same
 * pattern as updateFeeLine for consistent reliability.
 */
export async function addFeeLine(input: CreateFeeLineInput): Promise<FeeLine | null> {
  const readClient = await createClient();

  // Get max sort_order if not provided
  let sortOrder = input.sort_order;
  if (sortOrder == null) {
    const { data: maxRow } = await readClient
      .from(LINE_TABLE)
      .select('sort_order')
      .eq('quote_version_id', input.quote_version_id)
      .order('sort_order', { ascending: false })
      .limit(1)
      .maybeSingle();
    sortOrder = ((maxRow as { sort_order?: number } | null)?.sort_order ?? 0) + 10;
  }

  const writeClient = createServiceClient();
  const { data, error } = await writeClient
    .from(LINE_TABLE)
    .insert({
      ...input,
      sort_order: sortOrder,
      super_rate_charged: input.super_rate_charged ?? 0,
      super_rate_paid: input.super_rate_paid ?? 0,
      commission_rate: input.commission_rate ?? 0,
      notes: input.notes ?? null,
    })
    .select()
    .single();

  if (error) { reportDataError('[quotes] add line', error); return null; }

  // Recalc totals
  await recalcQuoteTotals(input.quote_version_id);

  await logAudit({
    userId: await getCurrentActor(),
    action: 'add_fee_line',
    tableName: LINE_TABLE,
    recordId: (data as FeeLine).id,
    newValue: { line_type: input.line_type, description: input.description, unit_price: String(input.unit_price) },
  });

  return data as FeeLine;
}

/**
 * Update a fee line. Returns the updated row on success or a structured
 * error result with the *actual* DB message so the caller can surface it.
 *
 * **Uses the service-role client for the write.** The action layer
 * (updateFeeLineAction) has already verified the caller is owner/partner
 * via requireOwnerOrPartner(), so RLS would be redundant at this point.
 * Using the service client here avoids two classes of silent failure
 * that were producing the opaque "Failed to update fee line" message:
 *   - RLS policy quirks (column-level grants, policy ordering, etc.)
 *   - PostgREST returning 0 rows after a successful update because the
 *     post-update SELECT was filtered out by RLS
 *
 * Same pattern is already in use for atelier_app_users writes (see
 * createAppUser / setAppUserActive in src/lib/data/app-users.ts) — the
 * regular client reads, the service client writes after the action
 * layer has gated the call.
 *
 * The updates payload is also explicitly whitelisted to a known set of
 * columns so a stray key from a future refactor can't poison the request.
 */
const FEE_LINE_UPDATABLE_COLUMNS = [
  'line_type', 'description', 'quantity', 'unit_price', 'subtotal',
  'cost_subtotal',
  'asf_rate', 'asf_amount', 'is_gst_exempt', 'is_super_bearing',
  'super_rate_charged', 'super_rate_paid', 'is_commissionable',
  'commission_rate', 'talent_id', 'crew_id', 'notes',
  'is_artist_reimbursement', 'sort_order',
] as const;

export async function updateFeeLine(
  id: string,
  updates: Partial<FeeLine>,
): Promise<{ ok: true; data: FeeLine } | { ok: false; error: string }> {
  // Pre-flight: verify the row exists and we can read it. If RLS denies the
  // read, the user shouldn't be editing it via the QuoteBuilder either —
  // surface that as a clear error instead of letting the write fall through.
  const readClient = await createClient();
  const { data: existing, error: readErr } = await readClient
    .from(LINE_TABLE)
    .select('id, quote_version_id')
    .eq('id', id)
    .maybeSingle();
  if (readErr) {
    reportDataError('[quotes] update line read-check', readErr);
    return { ok: false, error: `Cannot read fee line for update: ${readErr.message}` };
  }
  if (!existing) {
    return { ok: false, error: `Fee line ${id} not found (may have been deleted or RLS-hidden)` };
  }

  // Whitelist allowed columns — drop anything else, including computed
  // fields we never want a client to set.
  const safeUpdates: Record<string, unknown> = {};
  for (const key of FEE_LINE_UPDATABLE_COLUMNS) {
    if (key in updates) {
      const v = (updates as Record<string, unknown>)[key];
      if (v !== undefined) safeUpdates[key] = v;
    }
  }

  if (Object.keys(safeUpdates).length === 0) {
    return { ok: false, error: 'No updatable fields supplied' };
  }

  // Use the service client for the write — auth has already been verified
  // at the action layer. See the comment block above.
  const writeClient = createServiceClient();
  const { data, error } = await writeClient
    .from(LINE_TABLE)
    .update(safeUpdates)
    .eq('id', id)
    .select()
    .single();

  if (error) {
    reportDataError('[quotes] update line', error);
    const parts = [error.message, error.code, error.details, error.hint].filter(Boolean);
    return { ok: false, error: parts.join(' · ') || 'Unknown DB error' };
  }
  if (!data) {
    return { ok: false, error: `Update returned no row (fee line ${id} may have been deleted concurrently)` };
  }

  const line = data as FeeLine;
  await recalcQuoteTotals(line.quote_version_id);
  return { ok: true, data: line };
}

export async function removeFeeLine(id: string): Promise<boolean> {
  const readClient = await createClient();

  // Get the line first to know the quote version
  const { data: existing } = await readClient
    .from(LINE_TABLE)
    .select('quote_version_id')
    .eq('id', id)
    .maybeSingle();

  if (!existing) return false;

  // Service client for the write — auth already gated at the action layer.
  const writeClient = createServiceClient();
  const { error } = await writeClient
    .from(LINE_TABLE)
    .delete()
    .eq('id', id);

  if (error) { reportDataError('[quotes] remove line', error); return false; }

  await recalcQuoteTotals((existing as { quote_version_id: string }).quote_version_id);

  await logAudit({
    userId: await getCurrentActor(),
    action: 'remove_fee_line',
    tableName: LINE_TABLE,
    recordId: id,
  });

  return true;
}

// ============================================================
// Booking talent + crew data (junction tables)
// ============================================================

const BT_TABLE = 'atelier_booking_talent';
const BC_TABLE = 'atelier_booking_crew';

export async function listBookingTalent(bookingId: string) {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from(BT_TABLE)
    .select('*, talent:atelier_talent(*)')
    .eq('booking_id', bookingId);

  if (error) { reportDataError('[quotes] booking talent', error); return []; }
  return data ?? [];
}

export async function listBookingCrew(bookingId: string) {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from(BC_TABLE)
    .select('*, crew:atelier_crew(*)')
    .eq('booking_id', bookingId)
    .order('created_at', { ascending: true });

  if (error) { reportDataError('[quotes] booking crew', error); return []; }
  return data ?? [];
}

export async function addBookingTalent(input: {
  booking_id: string;
  talent_id: string;
  role_on_booking: string;
  day_rate?: number | null;
  half_day_rate?: number | null;
  usage_fee?: number | null;
  notes?: string | null;
}) {
  const supabase = await createClient();
  // Default the hold expiry to NOW + 14 days so unconfirmed assignments
  // don't go stale silently. Cleared once the talent confirms.
  const holdExpiresAt = new Date(Date.now() + 14 * 24 * 60 * 60 * 1000).toISOString();
  const { data, error } = await supabase
    .from(BT_TABLE)
    .insert({
      ...input,
      confirmed: false,
      hold_expires_at: holdExpiresAt,
    })
    .select()
    .single();

  if (error) { reportDataError('[quotes] add booking talent', error); return null; }
  return data;
}

export async function removeBookingTalent(id: string) {
  const supabase = await createClient();
  const { error } = await supabase.from(BT_TABLE).delete().eq('id', id);
  return !error;
}

export async function updateBookingCrewStatus(id: string, status: string) {
  const supabase = await createClient();
  const update: { status: string; confirmed_at?: string; hold_expires_at?: null } = { status };
  if (status === 'confirmed') {
    update.confirmed_at = new Date().toISOString();
    update.hold_expires_at = null;
  }
  const { data, error } = await supabase
    .from(BC_TABLE)
    .update(update)
    .eq('id', id)
    .select()
    .single();
  if (error) { reportDataError('[quotes] update booking crew status', error); return null; }
  return data;
}

export async function updateBookingCrewStatusByCrewId(bookingId: string, crewId: string, status: string) {
  const supabase = await createClient();
  const update: { status: string; confirmed_at?: string; hold_expires_at?: null } = { status };
  if (status === 'confirmed') {
    update.confirmed_at = new Date().toISOString();
    update.hold_expires_at = null;
  }
  const { data, error } = await supabase
    .from(BC_TABLE)
    .update(update)
    .eq('booking_id', bookingId)
    .eq('crew_id', crewId)
    .select();
  if (error) { reportDataError('[quotes] update booking crew status by crew_id', error); return null; }
  return data;
}

/**
 * Add a crew member to a booking.
 *
 * NEVER_AGAIN HARD BLOCK — doctrine NON-NEGOTIABLE.
 * Attempting to book crew tagged `never_again` is refused at the data layer
 * and surfaces a structured error the UI displays as an alert. Belt-and-braces:
 * the UI also filters them out, but the data layer is the floor — if a
 * compromised or buggy UI tries to insert one, it fails here.
 */
export async function addBookingCrew(input: {
  booking_id: string;
  crew_id: string;
  role_on_booking?: string | null;
  day_rate?: number | null;
  notes?: string | null;
}): Promise<
  | { ok: true; data: Record<string, unknown> }
  | { ok: false; error: string; reason: 'never_again' | 'db_error' }
> {
  const supabase = await createClient();

  // Tier check — refuse never_again before any insert.
  const { data: crew, error: crewErr } = await supabase
    .from('atelier_crew')
    .select('id, name, tier')
    .eq('id', input.crew_id)
    .maybeSingle();

  if (crewErr || !crew) {
    return { ok: false, error: 'Crew member not found', reason: 'db_error' };
  }

  if (crew.tier === 'never_again') {
    console.warn('[quotes] BLOCKED never_again booking attempt', { crew_id: crew.id, name: crew.name });
    return {
      ok: false,
      error: `${crew.name} is tagged "never again" — cannot be booked. Update their tier in /crew/${crew.id} first if circumstances have changed.`,
      reason: 'never_again',
    };
  }

  const holdExpiresAt = new Date(Date.now() + 14 * 24 * 60 * 60 * 1000).toISOString();
  const { data, error } = await supabase
    .from(BC_TABLE)
    .insert({
      ...input,
      status: 'pencilled',
      hold_expires_at: holdExpiresAt,
    })
    .select()
    .single();

  if (error) {
    reportDataError('[quotes] add booking crew', error);
    return { ok: false, error: error.message, reason: 'db_error' };
  }
  return { ok: true, data };
}

/**
 * Update the hold-expiry sunset for a booking_talent or booking_crew row.
 * `tableKind` selects which table; `nextExpiry` is null to clear the hold
 * (used when explicitly extending or removing the expiry).
 */
export async function updateHoldExpiry(
  tableKind: 'talent' | 'crew',
  id: string,
  nextExpiry: string | null,
): Promise<boolean> {
  const supabase = await createClient();
  const table = tableKind === 'talent' ? BT_TABLE : BC_TABLE;
  const { error } = await supabase
    .from(table)
    .update({ hold_expires_at: nextExpiry })
    .eq('id', id);
  if (error) { reportDataError('[quotes] update hold expiry', error); return false; }
  return true;
}

/**
 * Set the day-rate override for a single date on a booking_crew row.
 * Pass `null` rate to clear the override (date falls back to row-level day_rate).
 * Persists the full overrides object — concurrent writes on different dates
 * will race; the latest write wins. Acceptable for a single-operator agency.
 */
export async function updateCrewDayRateOverride(
  bookingCrewId: string,
  date: string,
  rate: number | null,
): Promise<boolean> {
  const supabase = await createClient();
  const { data: existing, error: readErr } = await supabase
    .from(BC_TABLE)
    .select('assigned_dates_rate_overrides')
    .eq('id', bookingCrewId)
    .maybeSingle();
  if (readErr || !existing) { reportDataError('[quotes] read override', readErr); return false; }

  const overrides: Record<string, number> =
    (existing as { assigned_dates_rate_overrides?: Record<string, number> }).assigned_dates_rate_overrides ?? {};
  if (rate == null || Number.isNaN(rate)) {
    delete overrides[date];
  } else {
    overrides[date] = rate;
  }
  const { error } = await supabase
    .from(BC_TABLE)
    .update({ assigned_dates_rate_overrides: overrides })
    .eq('id', bookingCrewId);
  if (error) { reportDataError('[quotes] write override', error); return false; }
  return true;
}

export async function removeBookingCrew(id: string) {
  const supabase = await createClient();
  const { error } = await supabase.from(BC_TABLE).delete().eq('id', id);
  return !error;
}

// ============================================================
// Entity history (for talent/crew detail pages)
// ============================================================

export type TalentBookingHistoryRow = {
  id: string;
  booking_id: string;
  booking_ref: string | null;
  booking_title: string;
  booking_state: string;
  booking_tier: string;
  role_on_booking: string | null;
  day_rate: number | null;
  usage_fee: number | null;
  confirmed: boolean;
};

export type RatePrecedent = {
  bookingId: string;
  bookingRef: string | null;
  tier: string;
  dayRate: number;
  state: string;
};

/**
 * Returns up to 5 most recent day rates for a talent on past bookings,
 * excluding the booking identified by exceptBookingId.
 * Used by QuoteBuilder to show rate context when setting the shoot fee.
 */
export async function getTalentRatePrecedents(
  talentId: string,
  exceptBookingId: string,
): Promise<RatePrecedent[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from(BT_TABLE)
    .select('booking_id, day_rate, booking:atelier_bookings(booking_ref, state, tier)')
    .eq('talent_id', talentId)
    .neq('booking_id', exceptBookingId)
    .not('day_rate', 'is', null)
    .order('created_at', { ascending: false })
    .limit(5);

  if (error || !data) return [];

  return ((data as unknown[]) as Array<{
    booking_id: string;
    day_rate: number;
    booking: { booking_ref: string | null; state: string; tier: string } | null;
  }>)
    .filter((r) => r.day_rate > 0 && r.booking)
    .map((r) => ({
      bookingId: r.booking_id,
      bookingRef: r.booking?.booking_ref ?? null,
      tier: r.booking?.tier ?? 'content',
      dayRate: r.day_rate,
      state: r.booking?.state ?? '',
    }));
}

export async function listTalentBookingHistory(talentId: string): Promise<TalentBookingHistoryRow[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from(BT_TABLE)
    .select('id, role_on_booking, day_rate, usage_fee, confirmed, booking_id, booking:atelier_bookings(booking_ref, title, state, tier)')
    .eq('talent_id', talentId)
    .order('created_at', { ascending: false });

  if (error) { reportDataError('[quotes] talent history', error); return []; }

  return ((data ?? []) as unknown[]).map((row) => {
    const r = row as Record<string, unknown>;
    const b = r.booking as Record<string, unknown> | null;
    return {
      id: r.id as string,
      booking_id: r.booking_id as string,
      booking_ref: (b?.booking_ref as string) ?? null,
      booking_title: (b?.title as string) ?? 'Unknown',
      booking_state: (b?.state as string) ?? 'brief_received',
      booking_tier: (b?.tier as string) ?? 'content',
      role_on_booking: r.role_on_booking as string | null,
      day_rate: r.day_rate as number | null,
      usage_fee: r.usage_fee as number | null,
      confirmed: r.confirmed as boolean,
    };
  });
}

// ============================================================
// Service-role (public) variants — bypasses RLS for unauthenticated routes
// ============================================================

/** Used by /q/[token] public quote viewer — no user session. */
export async function getLatestQuoteVersionPublic(bookingId: string): Promise<QuoteVersion | null> {
  const supabase = createServiceClient();
  const { data, error } = await supabase
    .from(QUOTE_TABLE)
    .select('*')
    .eq('booking_id', bookingId)
    .order('version', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error || !data) return null;
  return data as QuoteVersion;
}

/**
 * Service-role variant of getActiveQuoteVersion for /q/[token]. See that
 * function's docstring for the selection order. The token-gated route
 * has no user session, so this uses the service client.
 */
export async function getActiveQuoteVersionPublic(bookingId: string): Promise<QuoteVersion | null> {
  const supabase = createServiceClient();

  const sent = await supabase
    .from(QUOTE_TABLE)
    .select('*')
    .eq('booking_id', bookingId)
    .not('sent_at', 'is', null)
    .order('sent_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (sent.data) return sent.data as QuoteVersion;

  const populated = await supabase
    .from(QUOTE_TABLE)
    .select('*')
    .eq('booking_id', bookingId)
    .gt('grand_total', 0)
    .order('version', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (populated.data) return populated.data as QuoteVersion;

  return getLatestQuoteVersionPublic(bookingId);
}

/** Used by /q/[token] public quote viewer — no user session. */
export async function listFeeLinesPublic(quoteVersionId: string): Promise<FeeLine[]> {
  const supabase = createServiceClient();
  const { data, error } = await supabase
    .from(LINE_TABLE)
    .select('*')
    .eq('quote_version_id', quoteVersionId)
    .order('sort_order', { ascending: true });

  if (error) return [];
  return (data ?? []) as FeeLine[];
}
