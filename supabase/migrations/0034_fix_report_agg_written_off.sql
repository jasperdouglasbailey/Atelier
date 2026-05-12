-- Fix get_report_summary_agg for written_off state:
--   1. total_active must exclude written_off (it's terminal, not active)
--   2. Revenue SUM must exclude written_off (invoice unrecoverable, not revenue)
--      Also tighten revenue to only count bookings that reached a confirmed state
--      (quote_confirmed or later) so pipeline bookings don't inflate figures.

CREATE OR REPLACE FUNCTION public.get_report_summary_agg()
RETURNS TABLE(
  total_active      bigint,
  revenue_all_time  numeric,
  revenue_this_year  numeric,
  revenue_this_month numeric,
  revenue_last_month numeric,
  avg_booking_value  numeric
)
LANGUAGE sql
STABLE SECURITY DEFINER
AS $$
  SELECT
    -- Active = anything that has not reached a terminal state
    COUNT(*) FILTER (
      WHERE state NOT IN ('paid', 'invoice_issued', 'released', 'cancelled', 'written_off')
    ) AS total_active,

    -- Revenue = confirmed-or-later bookings only; written_off excluded
    COALESCE(SUM(grand_total) FILTER (
      WHERE state IN (
        'quote_confirmed', 'pre_production', 'shoot_live', 'morning_after_check',
        'post_production', 'final_delivery', 'invoice_issued', 'paid'
      )
    ), 0) AS revenue_all_time,

    COALESCE(SUM(grand_total) FILTER (
      WHERE state IN (
        'quote_confirmed', 'pre_production', 'shoot_live', 'morning_after_check',
        'post_production', 'final_delivery', 'invoice_issued', 'paid'
      )
      AND EXTRACT(YEAR FROM created_at) = EXTRACT(YEAR FROM NOW())
    ), 0) AS revenue_this_year,

    COALESCE(SUM(grand_total) FILTER (
      WHERE state IN (
        'quote_confirmed', 'pre_production', 'shoot_live', 'morning_after_check',
        'post_production', 'final_delivery', 'invoice_issued', 'paid'
      )
      AND DATE_TRUNC('month', created_at) = DATE_TRUNC('month', NOW())
    ), 0) AS revenue_this_month,

    COALESCE(SUM(grand_total) FILTER (
      WHERE state IN (
        'quote_confirmed', 'pre_production', 'shoot_live', 'morning_after_check',
        'post_production', 'final_delivery', 'invoice_issued', 'paid'
      )
      AND DATE_TRUNC('month', created_at) = DATE_TRUNC('month', NOW() - INTERVAL '1 month')
    ), 0) AS revenue_last_month,

    CASE WHEN COUNT(*) FILTER (
      WHERE grand_total > 0
      AND state IN (
        'quote_confirmed', 'pre_production', 'shoot_live', 'morning_after_check',
        'post_production', 'final_delivery', 'invoice_issued', 'paid'
      )
    ) > 0
      THEN AVG(grand_total) FILTER (
        WHERE grand_total > 0
        AND state IN (
          'quote_confirmed', 'pre_production', 'shoot_live', 'morning_after_check',
          'post_production', 'final_delivery', 'invoice_issued', 'paid'
        )
      )
      ELSE 0
    END AS avg_booking_value

  FROM atelier_bookings;
$$;
