import { createClient } from '@/lib/supabase/server';
import type { QuoteVersion, FeeLine, FeeLineType } from '@/lib/types/database';
import { computeQuoteTotals } from '@/lib/utils/fee-engine';
import { logAudit } from '@/lib/utils/audit';
import { emitEvent } from '@/lib/utils/events';

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
  }, { bookingId, actor: 'jasper' });

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
    userId: 'jasper',
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
    userId: 'jasper',
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

export async function addBookingCrew(input: {
  booking_id: string;
  crew_id: string;
  role_on_booking?: string | null;
  day_rate?: number | null;
  notes?: string | null;
}) {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from(BC_TABLE)
    .insert({
      ...input,
      status: 'pencilled',
    })
    .select()
    .single();

  if (error) { console.error('[quotes] add booking crew', error.message); return null; }
  return data;
}

export async function removeBookingCrew(id: string) {
  const supabase = await createClient();
  const { error } = await supabase.from(BC_TABLE).delete().eq('id', id);
  return !error;
}
