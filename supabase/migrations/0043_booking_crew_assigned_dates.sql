-- Multi-day crew assignment: allow per-day crew on bookings whose shoot
-- spans multiple days. Existing rows keep `assigned_dates` NULL, which
-- means "assigned to every day of the booking" (preserves current behaviour).
-- When populated, crew member is only assigned to the listed dates.

ALTER TABLE atelier_booking_crew
  ADD COLUMN IF NOT EXISTS assigned_dates DATE[];

COMMENT ON COLUMN atelier_booking_crew.assigned_dates IS
  'Per-day assignment for multi-day shoots. NULL/empty = assigned to all shoot days. Populated = only those specific dates.';
