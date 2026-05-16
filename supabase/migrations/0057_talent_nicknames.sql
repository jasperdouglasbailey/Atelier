-- 0057_talent_nicknames.sql
--
-- Replace the hardcoded `NICKNAMES: { 'Oliver': ['Oly'] }` map in
-- src/app/(dashboard)/inbox/page.tsx with a per-talent column. The map
-- was used by the brief-detection heuristic in /inbox to surface Gmail
-- messages that mention a talent by an informal name.
--
-- Storing per-talent means:
--   - Owner can curate nicknames in the talent edit form
--   - Heuristics scale to the full roster without code changes
--   - Brief-detection improves automatically as roster grows
--
-- text[] (not jsonb) so we can use GIN index for membership queries
-- later if the inbox heuristic ever needs server-side filtering.

ALTER TABLE public.atelier_talent
  ADD COLUMN IF NOT EXISTS nicknames text[] NOT NULL DEFAULT '{}';

-- Seed the one known nickname so the brief-detection behaviour doesn't
-- regress when the hardcoded map is removed. Match by working_name —
-- the only Oliver in the active roster.
UPDATE public.atelier_talent
  SET nicknames = ARRAY['Oly']
  WHERE working_name = 'Oliver Begg'
    AND nicknames = '{}'
    AND is_active = true;
