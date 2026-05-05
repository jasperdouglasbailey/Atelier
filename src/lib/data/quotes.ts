import { createClient } from '@/lib/supabase/server';
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

  if (error) { console.error('[quotes] list versions', error.message); return []; }
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

  if (error) { console.error('[quotes] create version', error.message); return null; }

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

  if (linesErr) { console.error('[quotes] fetch lines for recalc', linesErr.message); return null; }

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

  if (qvErr) { console.error('[quotes] update totals', qvErr.message); return null; }

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

export async function listFeeLines(quoteVersionId: string): Promise<FeeLine[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from(LINE_TABLE)
    .select('*')
    .eq('quote_version_id', quoteVersionId)
    .order('sort_order', { ascending: true });

  if (error) { console.error('[quotes] list lines', error.message); return []; }
  return (data ?? []) as FeeLine[];
}

export async function listFeeLinesForBooking(bookingId: string): Promise<FeeLine[]> {
  const supabase = await createClient();

  // Get latest quote version
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
};

export async function addFeeLine(input: CreateFeeLineInput): Promise<FeeLine | null> {
  const supabase = await createClient();

  // Get max sort_order if not provided
  let sortOrder = input.sort_order;
  if (sortOrder == null) {
    const { data: maxRow } = await supabase
      .from(LINE_TABLE)
      .select('sort_order')
      .eq('quote_version_id', input.quote_version_id)
      .order('sort_order', { ascending: false })
      .limit(1)
      .maybeSingle();
    sortOrder = ((maxRow as { sort_order?: number } | null)?.sort_order ?? 0) + 10;
  }

  const { data, error } = await supabase
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

  if (error) { console.error('[quotes] add line', error.message); return null; }

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

export async function updateFeeLine(
  id: string,
  updates: Partial<FeeLine>,
): Promise<FeeLine | null> {
  const supabase = await createClient();

  delete updates.id;
  delete updates.created_at;
  delete updates.quote_version_id;
  delete updates.booking_id;

  const { data, error } = await supabase
    .from(LINE_TABLE)
    .update(updates)
    .eq('id', id)
    .select()
    .single();

  if (error) { console.error('[quotes] update line', error.message); return null; }

  const line = data as FeeLine;
  await recalcQuoteTotals(line.quote_version_id);
  return line;
}

export async function removeFeeLine(id: string): Promise<boolean> {
  const supabase = await createClient();

  // Get the line first to know the quote version
  const { data: existing } = await supabase
    .from(LINE_TABLE)
    .select('quote_version_id')
    .eq('id', id)
    .maybeSingle();

  if (!existing) return false;

  const { error } = await supabase
    .from(LINE_TABLE)
    .delete()
    .eq('id', id);

  if (error) { console.error('[quotes] remove line', error.message); return false; }

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

  if (error) { console.error('[quotes] booking talent', error.message); return []; }
  return data ?? [];
}

export async function listBookingCrew(bookingId: string) {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from(BC_TABLE)
    .select('*, crew:atelier_crew(*)')
    .eq('booking_id', bookingId);

  if (error) { console.error('[quotes] booking crew', error.message); return []; }
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
  const { data, error } = await supabase
    .from(BT_TABLE)
    .insert({
      ...input,
      confirmed: false,
    })
    .select()
    .single();

  if (error) { console.error('[quotes] add booking talent', error.message); return null; }
  return data;
}

export async function removeBookingTalent(id: string) {
  const supabase = await createClient();
  const { error } = await supabase.from(BT_TABLE).delete().eq('id', id);
  return !error;
}

export async function updateBookingCrewStatus(id: string, status: string) {
  const supabase = await createClient();
  const update: { status: string; confirmed_at?: string } = { status };
  if (status === 'confirmed') update.confirmed_at = new Date().toISOString();
  const { data, error } = await supabase
    .from(BC_TABLE)
    .update(update)
    .eq('id', id)
    .select()
    .single();
  if (error) { console.error('[quotes] update booking crew status', error.message); return null; }
  return data;
}

export async function updateBookingCrewStatusByCrewId(bookingId: string, crewId: string, status: string) {
  const supabase = await createClient();
  const update: { status: string; confirmed_at?: string } = { status };
  if (status === 'confirmed') update.confirmed_at = new Date().toISOString();
  const { data, error } = await supabase
    .from(BC_TABLE)
    .update(update)
    .eq('booking_id', bookingId)
    .eq('crew_id', crewId)
    .select();
  if (error) { console.error('[quotes] update booking crew status by crew_id', error.message); return null; }
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

  const { data, error } = await supabase
    .from(BC_TABLE)
    .insert({
      ...input,
      status: 'pencilled',
    })
    .select()
    .single();

  if (error) {
    console.error('[quotes] add booking crew', error.message);
    return { ok: false, error: error.message, reason: 'db_error' };
  }
  return { ok: true, data };
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

  if (error) { console.error('[quotes] talent history', error.message); return []; }

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
