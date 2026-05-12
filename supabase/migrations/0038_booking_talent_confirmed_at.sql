-- Add confirmed_at timestamp to atelier_booking_talent.
-- Mirrors atelier_booking_crew.confirmed_at (in place since migration 0001).
-- Going forward, respondToTalentHoldAction sets this when a talent confirms.

ALTER TABLE public.atelier_booking_talent
  ADD COLUMN IF NOT EXISTS confirmed_at timestamptz;
