-- Migration 0029: Per-artist preferred crew lists.
--
-- Each talent (artist) can curate their own go-to crew. When that artist
-- is the primary on a booking, the BookingTeam picker surfaces their
-- preferred crew first, and the "Who's free?" availability blast targets
-- this list rather than the global preferred-core pool.
--
-- Many-to-many: a crew member can be preferred by multiple artists, and
-- an artist can have many preferred crew. role_hint lets an artist
-- override the crew member's primary role for THEIR shoots (e.g. Mason
-- might be a 1AC generally, but on Oliver's shoots he runs digital).

CREATE TABLE IF NOT EXISTS atelier_talent_preferred_crew (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  talent_id    UUID NOT NULL REFERENCES atelier_talent(id) ON DELETE CASCADE,
  crew_id      UUID NOT NULL REFERENCES atelier_crew(id)   ON DELETE CASCADE,
  role_hint    TEXT,         -- optional override of crew's primary_role for this artist
  sort_order   INT NOT NULL DEFAULT 0,
  notes        TEXT,         -- e.g. "always works AM only", "drives, has van"
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (talent_id, crew_id)
);

CREATE INDEX IF NOT EXISTS idx_talent_preferred_crew_talent
  ON atelier_talent_preferred_crew (talent_id);

CREATE INDEX IF NOT EXISTS idx_talent_preferred_crew_crew
  ON atelier_talent_preferred_crew (crew_id);

-- RLS — owner/partner full access, no exposure to talent/crew portals.
ALTER TABLE atelier_talent_preferred_crew ENABLE ROW LEVEL SECURITY;

CREATE POLICY owner_partner_full
  ON atelier_talent_preferred_crew
  FOR ALL
  USING (is_owner_or_partner())
  WITH CHECK (is_owner_or_partner());
