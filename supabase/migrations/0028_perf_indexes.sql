-- Migration 0028: Performance indexes
-- Six missing indexes identified during perf audit (2026-05-11).
-- All are btree on FK / lookup columns used in JOIN and WHERE clauses.
-- None affect correctness — they're additive reads-only optimisations.

-- atelier_booking_talent: talent_id used in JOIN when resolving talent on bookings
CREATE INDEX IF NOT EXISTS idx_booking_talent_talent_id
  ON atelier_booking_talent (talent_id);

-- atelier_booking_crew: crew_id used in JOIN when resolving crew on bookings
CREATE INDEX IF NOT EXISTS idx_booking_crew_crew_id
  ON atelier_booking_crew (crew_id);

-- atelier_usage_licences: booking_id used in every quote builder fetch
CREATE INDEX IF NOT EXISTS idx_usage_licences_booking_id
  ON atelier_usage_licences (booking_id);

-- atelier_audit_log: record_id used on detail pages to pull per-booking history
CREATE INDEX IF NOT EXISTS idx_audit_log_record_id
  ON atelier_audit_log (record_id);

-- atelier_fee_lines: talent_id and crew_id used in crew/talent detail page queries
CREATE INDEX IF NOT EXISTS idx_fee_lines_talent_id
  ON atelier_fee_lines (talent_id);

CREATE INDEX IF NOT EXISTS idx_fee_lines_crew_id
  ON atelier_fee_lines (crew_id);

-- RPC helper: booking counts by state (non-archived), used by the dashboard.
-- Returns rows of (state text, count bigint) — much cheaper than a full table scan
-- from Node.js that then aggregates in JS.
CREATE OR REPLACE FUNCTION get_booking_state_counts()
RETURNS TABLE (state text, count bigint)
LANGUAGE sql
STABLE
SECURITY DEFINER
AS $$
  SELECT state, COUNT(*) AS count
  FROM atelier_bookings
  WHERE is_archived = false
  GROUP BY state;
$$;

-- RPC helper: dashboard summary aggregations in one round-trip.
-- Returns a single JSON object with all the numeric KPIs getReportSummary() needs.
-- Caller still handles shoot_dates range-overlap in JS (Postgres daterange
-- operations aren't exposed via this helper to keep it readable).
CREATE OR REPLACE FUNCTION get_report_summary_agg()
RETURNS TABLE (
  total_active      bigint,
  revenue_all_time  numeric,
  revenue_this_year numeric,
  revenue_this_month numeric,
  revenue_last_month numeric,
  avg_booking_value numeric
)
LANGUAGE sql
STABLE
SECURITY DEFINER
AS $$
  SELECT
    COUNT(*) FILTER (WHERE state NOT IN ('paid','invoice_issued','released','cancelled'))
      AS total_active,
    COALESCE(SUM(grand_total), 0)
      AS revenue_all_time,
    COALESCE(SUM(grand_total) FILTER (WHERE EXTRACT(YEAR FROM created_at) = EXTRACT(YEAR FROM NOW())), 0)
      AS revenue_this_year,
    COALESCE(SUM(grand_total) FILTER (WHERE DATE_TRUNC('month', created_at) = DATE_TRUNC('month', NOW())), 0)
      AS revenue_this_month,
    COALESCE(SUM(grand_total) FILTER (WHERE DATE_TRUNC('month', created_at) = DATE_TRUNC('month', NOW() - INTERVAL '1 month')), 0)
      AS revenue_last_month,
    CASE WHEN COUNT(*) FILTER (WHERE grand_total > 0) > 0
      THEN AVG(grand_total) FILTER (WHERE grand_total > 0)
      ELSE 0
    END AS avg_booking_value
  FROM atelier_bookings;
$$;
