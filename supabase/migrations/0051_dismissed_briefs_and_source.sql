-- Dismissed brief candidates + source_gmail_message_id on bookings.
--
-- Bug fix: PotentialBriefs panel on /inbox was dismissing candidates in
-- React local state only (no persistence). Every page refresh re-fetched
-- the same Gmail messages and they all came back. Reported by Jasper —
-- "I dismissed some as 'not a brief' and yet it still turns up when i
-- refresh? this can't happen?"
--
-- Fix: persist dismissals in a new table. Server-side filter excludes
-- dismissed message_ids from `findPotentialBriefs` so they don't reappear.
-- Recovery: dismissals can be undone within 8s via toast undo, OR later
-- via a "Show N dismissed" toggle that restores any historical dismissal.
--
-- Convert-to-booking undo: store the source Gmail message_id on the
-- booking row so the booking detail page can offer an "Undo conversion"
-- action when the booking is still in `brief_received` and < 24h old.
-- Deleting the booking lets the email naturally re-appear in the next
-- Potential Briefs scan.

-- 1. Dismissed candidates table
CREATE TABLE IF NOT EXISTS public.atelier_dismissed_brief_candidates (
  gmail_message_id text PRIMARY KEY,
  dismissed_at     timestamptz NOT NULL DEFAULT now(),
  dismissed_by     uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  -- Stored for the "Show dismissed" recovery UI so we don't need to
  -- re-fetch from Gmail (the message may have been archived in Gmail too).
  subject          text,
  from_header      text,
  received_at      timestamptz
);

CREATE INDEX IF NOT EXISTS idx_dismissed_briefs_dismissed_at
  ON public.atelier_dismissed_brief_candidates (dismissed_at DESC);

ALTER TABLE public.atelier_dismissed_brief_candidates ENABLE ROW LEVEL SECURITY;

-- Owner + partner full access; everyone else gets nothing. Talent / crew
-- portal users have no business with this table.
DROP POLICY IF EXISTS "dismissed_briefs_owner_partner" ON public.atelier_dismissed_brief_candidates;
CREATE POLICY "dismissed_briefs_owner_partner"
  ON public.atelier_dismissed_brief_candidates
  FOR ALL
  USING (public.is_owner_or_partner())
  WITH CHECK (public.is_owner_or_partner());

-- 2. source_gmail_message_id on bookings
ALTER TABLE public.atelier_bookings
  ADD COLUMN IF NOT EXISTS source_gmail_message_id text;

CREATE INDEX IF NOT EXISTS idx_bookings_source_gmail
  ON public.atelier_bookings (source_gmail_message_id)
  WHERE source_gmail_message_id IS NOT NULL;

COMMENT ON COLUMN public.atelier_bookings.source_gmail_message_id IS
  'Gmail message ID this booking was auto-converted from via /inbox Potential Briefs. NULL for manually-created bookings. Enables the "Undo conversion" action on the booking detail page within 24h of creation.';
