-- Hold expiry + per-day rate overrides
-- ---------------------------------------------------------------------------
-- hold_expires_at: When a talent/crew is added to a booking but not yet
-- confirmed, they sit on a "hold". Without an explicit expiry the hold goes
-- stale — Jasper either forgets to chase or the talent assumes they've been
-- released. This column gives every unconfirmed assignment a known sunset.
-- NULL = no expiry tracked (legacy rows + confirmed rows).
--
-- assigned_dates_rate_overrides: Crew sometimes work different rates on
-- different shoot days (full day on Mon, half day on Tue). The single
-- `day_rate` column flattens this and forces Jasper to manage rate maths in
-- his head when adding fee lines. Shape: { "2026-05-13": 700, "2026-05-14": 500 }.
-- A missing key falls back to atelier_booking_crew.day_rate.

ALTER TABLE atelier_booking_talent
  ADD COLUMN IF NOT EXISTS hold_expires_at timestamptz;

ALTER TABLE atelier_booking_crew
  ADD COLUMN IF NOT EXISTS hold_expires_at timestamptz;

ALTER TABLE atelier_booking_crew
  ADD COLUMN IF NOT EXISTS assigned_dates_rate_overrides jsonb NOT NULL DEFAULT '{}'::jsonb;

-- Backfill: every existing unconfirmed assignment gets a 14-day hold from
-- creation. Confirmed rows (confirmed_at IS NOT NULL) stay NULL.
UPDATE atelier_booking_talent
SET hold_expires_at = created_at + INTERVAL '14 days'
WHERE hold_expires_at IS NULL AND confirmed_at IS NULL;

UPDATE atelier_booking_crew
SET hold_expires_at = created_at + INTERVAL '14 days'
WHERE hold_expires_at IS NULL AND confirmed_at IS NULL;
