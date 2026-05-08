-- Booking archive flag (PR#45 — lifecycle).
--
-- Archive is a soft-hide for bookings that are over but should still be
-- recoverable: the personal data stays intact, the row is just hidden
-- from the active lists. Distinct from delete (terminal, anonymises to
-- corpus) and anonymise (privacy compliance, irreversible — applies to
-- people, not bookings).
--
-- Default false so existing rows stay active. is_archived joins is_active
-- semantics from talent/crew so the bookings list filter logic mirrors
-- the existing pattern on people lists.

ALTER TABLE atelier_bookings
  ADD COLUMN IF NOT EXISTS is_archived boolean NOT NULL DEFAULT false;

ALTER TABLE atelier_bookings
  ADD COLUMN IF NOT EXISTS archived_at timestamptz;

-- Index — every list query filters on is_archived, so this is hot.
CREATE INDEX IF NOT EXISTS atelier_bookings_is_archived_idx
  ON atelier_bookings (is_archived)
  WHERE is_archived = false;
