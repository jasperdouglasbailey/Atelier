import { createClient } from '@/lib/supabase/server';
import { ACTIVE_STATES } from '@/lib/utils/constants';

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
    .select('state, grand_total, created_at');

  if (error || !data) return {
    totalActiveBookings: 0, totalRevenueAllTime: 0,
    revenueThisYear: 0, revenueThisMonth: 0, revenueLastMonth: 0, avgBookingValue: 0,
  };

  const rows = data as { state: string; grand_total: number; created_at: string }[];

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

  return {
    totalActiveBookings: active.length,
    totalRevenueAllTime,
    revenueThisYear,
    revenueThisMonth,
    revenueLastMonth,
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

export async function getTopClients(limit = 8): Promise<ClientRevenueStat[]> {
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
