-- ============================================================
-- Migration 0002 — Artist disciplines + preferred comms
-- ============================================================
-- Saunders & Co represents creatives, not models. Talent (artists)
-- can be photographers, videographers, wardrobe stylists, hair,
-- makeup, hair+makeup, or manicurists. The schema previously had
-- no field capturing this — adding `discipline` (enum, required for
-- new rows) plus a free-text `specialty` for sub-niches.
--
-- Backfill maps known artists per CLAUDE.md doctrine. Unknown rows
-- default to 'photographer' (the agency's largest cohort) and should
-- be reviewed by the operator after this migration runs.

-- 1. Discipline enum (idempotent — safe to re-run)
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'atelier_artist_discipline') THEN
    CREATE TYPE public.atelier_artist_discipline AS ENUM (
      'photographer',
      'videographer',
      'wardrobe_stylist',
      'hair',
      'makeup',
      'hair_and_makeup',
      'manicurist'
    );
  END IF;
END$$;

-- 2. Add columns nullable first so the backfill can run cleanly.
ALTER TABLE public.atelier_talent
  ADD COLUMN IF NOT EXISTS discipline public.atelier_artist_discipline,
  ADD COLUMN IF NOT EXISTS specialty text,
  ADD COLUMN IF NOT EXISTS preferred_comms text;

-- 3. Backfill — known artists per CLAUDE.md doctrine; safe fallback
-- for anyone else.
UPDATE public.atelier_talent
   SET discipline = CASE
     WHEN working_name ILIKE 'Oliver Begg%'      THEN 'photographer'::public.atelier_artist_discipline
     WHEN working_name ILIKE 'Jaque Di Condio%'  THEN 'hair_and_makeup'::public.atelier_artist_discipline
     ELSE 'photographer'::public.atelier_artist_discipline
   END
 WHERE discipline IS NULL;

-- 4. Lock NOT NULL now that backfill is complete.
ALTER TABLE public.atelier_talent
  ALTER COLUMN discipline SET NOT NULL;

-- 5. preferred_comms on clients + crew (already added on talent above).
-- preferred_comms accepts: 'email', 'sms', 'imessage', 'phone', 'whatsapp'.
-- Free text rather than enum so it's flexible — the values are locked in
-- src/lib/utils/constants.ts (PREFERRED_COMMS_OPTIONS).
ALTER TABLE public.atelier_clients
  ADD COLUMN IF NOT EXISTS preferred_comms text;

ALTER TABLE public.atelier_crew
  ADD COLUMN IF NOT EXISTS preferred_comms text;
