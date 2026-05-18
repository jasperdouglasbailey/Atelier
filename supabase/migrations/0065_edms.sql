-- 0065_edms.sql
--
-- EDMs (email marketing) — Tier 1.
--
-- Two templates: monthly round-up + artist/campaign-specific. Slots are
-- filled from a JSONB payload so we don't need a column per template.
-- The composer renders the HTML preview at view time from (template, payload).
-- A Gmail draft is created on demand with manual recipient paste.
--
-- Why JSONB instead of columns: each template has different slots and
-- they will evolve. Two templates today, maybe three in six months. A
-- per-slot column table is overkill at this volume (max 2 sends/month).

CREATE TABLE IF NOT EXISTS public.atelier_edms (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  template      text NOT NULL CHECK (template IN ('monthly_roundup', 'artist_campaign')),
  title         text NOT NULL,                  -- internal label, not the email subject
  subject       text,                            -- the actual email subject line
  preheader     text,                            -- preview text (first ~90 chars in inbox)
  payload       jsonb NOT NULL DEFAULT '{}'::jsonb,
  status        text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'sent', 'archived')),
  gmail_draft_id text,                           -- last-created Gmail draft id (single source — recreating overwrites)
  sent_at       timestamptz,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now(),
  created_by    uuid REFERENCES auth.users(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_atelier_edms_status_updated
  ON public.atelier_edms (status, updated_at DESC);

ALTER TABLE public.atelier_edms ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "edms_owner_partner" ON public.atelier_edms;
CREATE POLICY "edms_owner_partner"
  ON public.atelier_edms
  FOR ALL
  USING (public.is_owner_or_partner())
  WITH CHECK (public.is_owner_or_partner());

COMMENT ON TABLE public.atelier_edms IS
  'Email marketing drafts and sent records. Renders to a Gmail draft for manual recipient paste — no list management, no list subscription, no automation. Tier 1 scope.';
