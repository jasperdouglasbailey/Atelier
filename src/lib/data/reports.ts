import { createClient } from '@/lib/supabase/server';
import { ACTIVE_STATES, QUERY_LIMITS } from '@/lib/utils/constants';

export type WinRateStat = {
  sent: number;       // quote has been sent (all non-early states)
  confirmed: number;  // converted to confirmed booking
  lost: number;       // released or cancelled after quoting
  winRate: number;    // confirmed / (confirmed + lost), 0–1
};

export type TalentStat = {
  talentId: string;
  name: string;
  discipline: string | null;
  bookingCount: number;
  totalRevenue: number; // grand_total sum across their bookings
};

export type MonthlyRevenueStat = {
  month: string; // 'YYYY-MM'
  bookingCount: number;
  grandTotal: number;
};

export type StateCountStat = {
  state: string;
  count: number;
};

export type TierStat = {
  tier: string;
  count: number;
  grandTotal: number;
};

export type ClientRevenueStat = {
  clientId: string;
  clientName: string;
  bookingCount: number;
  grandTotal: number;
};

export type ReportSummary = {
  totalActiveBookings: number;
  totalRevenueAllTime: number;
  revenueThisYear: number;
  revenueThisMonth: number;
  revenueLastMonth: number;
  /**
   * Confirmed revenue from bookings whose shoot dates intersect the
   * current week (Mon-Sun, agency timezone). "Confirmed" here means
   * the booking has reached `quote_confirmed` or later — so you're
   * looking at money already on the books for this week's work.
   */
  revenueThisWeek: number;
  avgBookingValue: number;
};

const TABLE = 'atelier_bookings';

export async function getReportSummary(): Promise<ReportSummary> {
  const supabase = await createClient();

  const now = new Date();
  const thisYear = now.getFullYear();
  const thisMonth = now.getMonth() + 1;
  const lastMonthDate = new Date(now.getFullYear(), now.getMonth() - 1, 1);
  const lastMonth = lastMonthDate.getMonth() + 1;
  const lastMonthYear = lastMonthDate.getFullYear();

  const { data, error } = await supabase
    .from(TABLE)
    .select('state, grand_total, created_at, shoot_dates');

  if (error || !data) return {
    totalActiveBookings: 0, totalRevenueAllTime: 0,
    revenueThisYear: 0, revenueThisMonth: 0, revenueLastMonth: 0, revenueThisWeek: 0, avgBookingValue: 0,
  };

  const rows = data as { state: string; grand_total: number; created_at: string; shoot_dates: string | null }[];

  const active = rows.filter((r) => ACTIVE_STATES.includes(r.state as never));
  const completed = rows.filter((r) => r.state === 'paid' || r.state === 'invoice_issued');

  const totalRevenueAllTime = rows.reduce((s, r) => s + (r.grand_total ?? 0), 0);

  const thisYearRows = rows.filter((r) => new Date(r.created_at).getFullYear() === thisYear);
  const revenueThisYear = thisYearRows.reduce((s, r) => s + (r.grand_total ?? 0), 0);

  const thisMonthRows = rows.filter((r) => {
    const d = new Date(r.created_at);
    return d.getFullYear() === thisYear && d.getMonth() + 1 === thisMonth;
  });
  const revenueThisMonth = thisMonthRows.reduce((s, r) => s + (r.grand_total ?? 0), 0);

  const lastMonthRows = rows.filter((r) => {
    const d = new Date(r.created_at);
    return d.getFullYear() === lastMonthYear && d.getMonth() + 1 === lastMonth;
  });
  const revenueLastMonth = lastMonthRows.reduce((s, r) => s + (r.grand_total ?? 0), 0);

  const withValue = rows.filter((r) => r.grand_total > 0);
  const avgBookingValue = withValue.length > 0
    ? withValue.reduce((s, r) => s + r.grand_total, 0) / withValue.length
    : 0;

  // Revenue this week — confirmed bookings whose shoot intersects
  // Mon-Sun of the current week. Different shape from the month/year
  // figures (which count by booking creation date) because "this week"
  // is a forward-looking pulse: what's about to land in our pocket.
  const todayStart = new Date(now);
  todayStart.setHours(0, 0, 0, 0);
  const dow = (todayStart.getDay() + 6) % 7; // Mon = 0
  const weekStart = new Date(todayStart);
  weekStart.setDate(todayStart.getDate() - dow);
  const weekEnd = new Date(weekStart);
  weekEnd.setDate(weekStart.getDate() + 7); // exclusive
  const weekStartYmd = weekStart.toISOString().slice(0, 10);
  const weekEndYmd = weekEnd.toISOString().slice(0, 10);

  const CONFIRMED_OR_LATER = new Set([
    'quote_confirmed', 'pre_production', 'shoot_live',
    'morning_after_check', 'post_production', 'final_delivery',
    'invoice_issued', 'paid',
  ]);
  const revenueThisWeek = rows
    .filter((r) => CONFIRMED_OR_LATER.has(r.state))
    .filter((r) => {
      if (!r.shoot_dates) return false;
      const m = r.shoot_dates.match(/[\[(]([\d-]+),([\d-]+)?[\])]/);
      if (!m || !m[1]) return false;
      const start = m[1];
      const endExclusive = m[2] ?? start;
      // Range overlap test (lower-inclusive, upper-exclusive on both sides)
      return start < weekEndYmd && endExclusive > weekStartYmd;
    })
    .reduce((s, r) => s + (r.grand_total ?? 0), 0);

  return {
    totalActiveBookings: active.length,
    totalRevenueAllTime,
    revenueThisYear,
    revenueThisMonth,
    revenueLastMonth,
    revenueThisWeek,
    avgBookingValue,
  };
}

export async function getMonthlyRevenue(months = 12): Promise<MonthlyRevenueStat[]> {
  const supabase = await createClient();

  const cutoff = new Date();
  cutoff.setMonth(cutoff.getMonth() - months);

  const { data, error } = await supabase
    .from(TABLE)
    .select('grand_total, created_at')
    .gte('created_at', cutoff.toISOString())
    .order('created_at', { ascending: true });

  if (error || !data) return [];

  const byMonth: Record<string, MonthlyRevenueStat> = {};
  for (const row of data as { grand_total: number; created_at: string }[]) {
    const d = new Date(row.created_at);
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
    if (!byMonth[key]) byMonth[key] = { month: key, bookingCount: 0, grandTotal: 0 };
    byMonth[key].bookingCount++;
    byMonth[key].grandTotal += row.grand_total ?? 0;
  }

  return Object.values(byMonth).sort((a, b) => a.month.localeCompare(b.month));
}

export async function getStateBreakdown(): Promise<StateCountStat[]> {
  const supabase = await createClient();
  const { data, error } = await supabase.from(TABLE).select('state');
  if (error || !data) return [];

  const counts: Record<string, number> = {};
  for (const row of data as { state: string }[]) {
    counts[row.state] = (counts[row.state] ?? 0) + 1;
  }

  return Object.entries(counts)
    .map(([state, count]) => ({ state, count }))
    .sort((a, b) => b.count - a.count);
}

export async function getTierBreakdown(): Promise<TierStat[]> {
  const supabase = await createClient();
  const { data, error } = await supabase.from(TABLE).select('tier, grand_total');
  if (error || !data) return [];

  const stats: Record<string, TierStat> = {};
  for (const row of data as { tier: string; grand_total: number }[]) {
    if (!stats[row.tier]) stats[row.tier] = { tier: row.tier, count: 0, grandTotal: 0 };
    stats[row.tier].count++;
    stats[row.tier].grandTotal += row.grand_total ?? 0;
  }

  return Object.values(stats).sort((a, b) => b.grandTotal - a.grandTotal);
}

export async function getWinRate(): Promise<WinRateStat> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from(TABLE)
    .select('state, grand_total');

  if (error || !data) return { sent: 0, confirmed: 0, lost: 0, winRate: 0 };

  const rows = data as { state: string; grand_total: number }[];

  const CONFIRMED_STATES = new Set([
    'quote_confirmed', 'pre_production', 'shoot_live', 'morning_after_check',
    'post_production', 'final_delivery', 'invoice_issued', 'paid',
  ]);
  const EARLY_STATES = new Set(['brief_received', 'brief_parsed', 'quote_drafted']);

  // "Quoted" = a quote was sent or the booking progressed beyond that point
  const quoted = rows.filter((r) => !EARLY_STATES.has(r.state));
  const confirmed = quoted.filter((r) => CONFIRMED_STATES.has(r.state)).length;
  const lost = quoted.filter((r) => r.state === 'released' || r.state === 'cancelled').length;
  const decided = confirmed + lost;
  const winRate = decided > 0 ? confirmed / decided : 0;

  return { sent: quoted.length, confirmed, lost, winRate };
}

export async function getTopTalent(limit: number = QUERY_LIMITS.reports_top_n): Promise<TalentStat[]> {
  const supabase = await createClient();

  const { data, error } = await supabase
    .from('atelier_booking_talent')
    .select(
      'talent_id, booking:atelier_bookings!atelier_booking_talent_booking_id_fkey(grand_total), talent:atelier_talent!atelier_booking_talent_talent_id_fkey(id, working_name, discipline)',
    );

  if (error || !data) return [];

  const byTalent: Record<string, TalentStat> = {};
  for (const row of data as unknown as {
    talent_id: string;
    booking: { grand_total: number } | null;
    talent: { id: string; working_name: string; discipline: string | null } | null;
  }[]) {
    if (!row.talent_id || !row.talent) continue;
    const key = row.talent_id;
    if (!byTalent[key]) {
      byTalent[key] = {
        talentId: row.talent_id,
        name: row.talent.working_name,
        discipline: row.talent.discipline,
        bookingCount: 0,
        totalRevenue: 0,
      };
    }
    byTalent[key].bookingCount++;
    byTalent[key].totalRevenue += row.booking?.grand_total ?? 0;
  }

  return Object.values(byTalent)
    .sort((a, b) => b.bookingCount - a.bookingCount || b.totalRevenue - a.totalRevenue)
    .slice(0, limit);
}

export async function getTopClients(limit: number = QUERY_LIMITS.reports_top_n): Promise<ClientRevenueStat[]> {
  const supabase = await createClient();

  const { data, error } = await supabase
    .from(TABLE)
    .select('client_id, grand_total, client:atelier_clients!atelier_bookings_client_id_fkey(name, company)')
    .not('client_id', 'is', null);

  if (error || !data) return [];

  const byClient: Record<string, ClientRevenueStat> = {};
  // Supabase returns joined records as arrays when using FK hints; cast via unknown
  for (const row of data as unknown as {
    client_id: string;
    grand_total: number;
    client: { name: string; company: string | null } | null;
  }[]) {
    if (!row.client_id) continue;
    const clientName = row.client?.company || row.client?.name || 'Unknown';
    if (!byClient[row.client_id]) {
      byClient[row.client_id] = {
        clientId: row.client_id,
        clientName,
        bookingCount: 0,
        grandTotal: 0,
      };
    }
    byClient[row.client_id].bookingCount++;
    byClient[row.client_id].grandTotal += row.grand_total ?? 0;
  }

  return Object.values(byClient)
    .sort((a, b) => b.grandTotal - a.grandTotal)
    .slice(0, limit);
}
