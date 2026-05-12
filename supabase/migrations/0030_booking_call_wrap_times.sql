-- Migration 0030: Add call_time + wrap_time to atelier_bookings.
--
-- Call sheets need a planned crew start ("call") and finish ("wrap") time
-- on the shoot day. These are free-text TIME strings (HH:MM, 24-hour) so
-- they format the same on the call sheet PDF as they're entered.
--
-- TIME WITHOUT TIME ZONE is the right Postgres type — it stores only a
-- clock value (no date, no timezone). The shoot date is already on the
-- booking, so the combined "call moment" is shoot_dates.start + call_time
-- interpreted in agency_config.timezone (AEST/AEDT). We don't bake the
-- timezone into the column itself because the agency only operates in AU.

ALTER TABLE atelier_bookings
  ADD COLUMN IF NOT EXISTS call_time TIME,
  ADD COLUMN IF NOT EXISTS wrap_time TIME;

COMMENT ON COLUMN atelier_bookings.call_time IS 'Crew call (start) time on shoot day, local agency TZ (TIME, no date).';
COMMENT ON COLUMN atelier_bookings.wrap_time IS 'Crew wrap (finish) time on shoot day, local agency TZ (TIME, no date).';
