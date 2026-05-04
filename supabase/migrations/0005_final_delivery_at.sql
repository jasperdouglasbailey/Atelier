-- Timestamp when the booking first entered final_delivery state.
-- Used by the post-shoot client-chase cron to compute the day-7/14/22/30
-- reminder cadence without joining the events log.

ALTER TABLE atelier_bookings
  ADD COLUMN IF NOT EXISTS final_delivery_at timestamptz;
