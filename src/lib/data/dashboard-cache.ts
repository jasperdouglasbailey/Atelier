/**
 * Cached dashboard data fetchers.
 *
 * `unstable_cache` caches results at the server level across requests.
 * The wrapped functions must NOT use per-request dynamic APIs (cookies,
 * headers) — they use the service client instead, which is fine here
 * because:
 *   a) this data is aggregate/non-personal (counts, revenue totals)
 *   b) the dashboard is only reachable by owner/partner accounts
 *   c) all owners see the same numbers
 *
 * Tags: ['bookings'] — invalidated by revalidateTag('bookings') which is
 * called from every booking write action. TTL is a safety net; real
 * freshness comes from tag-based invalidation.
 */

import { unstable_cache } from 'next/cache';
import { createServiceClient } from '@/lib/supabase/service';
import { ACTIVE_STATES } from '@/lib/utils/constants';
import type { ReportSummary } from './reports';

const CACHE_OPTIONS = { revalidate: 60, tags: ['bookings'] as string[] };

// ---------------------------------------------------------------------------
// Booking counts by state
// ---------------------------------------------------------------------------

export const getCachedBookingCounts: () => Promise<Record<string, number>> =
  unstable_cache(
    async (): Promise<Record<string, number>> => {
      const supabase = createServiceClient();
      const { data, error } = await supabase.rpc('get_booking_state_counts');

      if (error) {
        // Fallback: full table scan + JS aggregation
        const { data: fallback } = await supabase
          .from('atelier_bookings')
          .select('state')
          .eq('is_archived', false);
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
    },
    ['booking-state-counts'],
    CACHE_OPTIONS,
  );

// ---------------------------------------------------------------------------
// Report summary (KPI totals)
// ---------------------------------------------------------------------------

export const getCachedReportSummary: () => Promise<ReportSummary> =
  unstable_cache(
    async (): Promise<ReportSummary> => {
      const supabase = createServiceClient();
      const now = new Date();

      const CONFIRMED_OR_LATER_STATES = [
        'quote_confirmed', 'pre_production', 'shoot_live',
        'morning_after_check', 'post_production', 'final_delivery',
        'invoice_issued', 'paid',
      ];

      const [aggResult, weekResult] = await Promise.all([
        supabase.rpc('get_report_summary_agg'),
        supabase
          .from('atelier_bookings')
          .select('grand_total, shoot_dates')
          .in('state', CONFIRMED_OR_LATER_STATES),
      ]);

      const ZERO: ReportSummary = {
        totalActiveBookings: 0, totalRevenueAllTime: 0,
        revenueThisYear: 0, revenueThisMonth: 0, revenueLastMonth: 0,
        revenueThisWeek: 0, avgBookingValue: 0,
      };

      let agg = aggResult.data?.[0] as {
        total_active: number; revenue_all_time: number;
        revenue_this_year: number; revenue_this_month: number;
        revenue_last_month: number; avg_booking_value: number;
      } | null;

      if (aggResult.error || !agg) {
        const { data: fallback, error: fbErr } = await supabase
          .from('atelier_bookings').select('state, grand_total, created_at');
        if (fbErr || !fallback) return ZERO;
        const rows = fallback as { state: string; grand_total: number; created_at: string }[];
        const thisYear = now.getFullYear();
        const thisMonth = now.getMonth() + 1;
        const lastMonthDate = new Date(now.getFullYear(), now.getMonth() - 1, 1);
        agg = {
          total_active: rows.filter((r) => ACTIVE_STATES.includes(r.state as never)).length,
          revenue_all_time: rows.reduce((s, r) => s + (r.grand_total ?? 0), 0),
          revenue_this_year: rows.filter((r) => new Date(r.created_at).getFullYear() === thisYear).reduce((s, r) => s + (r.grand_total ?? 0), 0),
          revenue_this_month: rows.filter((r) => { const d = new Date(r.created_at); return d.getFullYear() === thisYear && d.getMonth() + 1 === thisMonth; }).reduce((s, r) => s + (r.grand_total ?? 0), 0),
          revenue_last_month: rows.filter((r) => { const d = new Date(r.created_at); return d.getFullYear() === lastMonthDate.getFullYear() && d.getMonth() + 1 === (lastMonthDate.getMonth() + 1); }).reduce((s, r) => s + (r.grand_total ?? 0), 0),
          avg_booking_value: (() => { const w = rows.filter((r) => r.grand_total > 0); return w.length > 0 ? w.reduce((s, r) => s + r.grand_total, 0) / w.length : 0; })(),
        };
      }

      // Week revenue: JS range-overlap on shoot_dates (Postgres daterange string)
      const todayStart = new Date(now);
      todayStart.setHours(0, 0, 0, 0);
      const dow = (todayStart.getDay() + 6) % 7; // Mon = 0
      const weekStart = new Date(todayStart);
      weekStart.setDate(todayStart.getDate() - dow);
      const weekEnd = new Date(weekStart);
      weekEnd.setDate(weekStart.getDate() + 7);
      const weekStartYmd = weekStart.toISOString().slice(0, 10);
      const weekEndYmd = weekEnd.toISOString().slice(0, 10);

      const weekRows = (weekResult.data ?? []) as { grand_total: number; shoot_dates: string | null }[];
      const revenueThisWeek = weekRows
        .filter((r) => {
          if (!r.shoot_dates) return false;
          const m = r.shoot_dates.match(/[\[(]([\d-]+),([\d-]+)?[\])]/);
          if (!m || !m[1]) return false;
          const start = m[1];
          const endExclusive = m[2] ?? start;
          return start < weekEndYmd && endExclusive > weekStartYmd;
        })
        .reduce((s, r) => s + (r.grand_total ?? 0), 0);

      return {
        totalActiveBookings: Number(agg.total_active),
        totalRevenueAllTime: Number(agg.revenue_all_time),
        revenueThisYear: Number(agg.revenue_this_year),
        revenueThisMonth: Number(agg.revenue_this_month),
        revenueLastMonth: Number(agg.revenue_last_month),
        revenueThisWeek,
        avgBookingValue: Number(agg.avg_booking_value),
      };
    },
    ['report-summary'],
    CACHE_OPTIONS,
  );
