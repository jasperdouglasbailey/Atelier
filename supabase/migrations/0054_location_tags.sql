-- Migration 0054: User-defined tags on locations.
--
-- tags: text[] of arbitrary user-typed labels. Distinct from `facilities`
-- (which is a fixed enum-style list of known options). Tags are free-form
-- so producers can capture vibe / character / use-case ("boutique",
-- "industrial", "rooftop with views", "vintage", "minimal").
--
-- Re-use across locations comes from the data layer: `getAllLocationTags()`
-- returns the union of every location's tags so the form can autocomplete
-- against existing values when adding new ones.

ALTER TABLE public.atelier_locations
  ADD COLUMN IF NOT EXISTS tags text[];

COMMENT ON COLUMN public.atelier_locations.tags IS
  'User-defined free-form tags. Reused across locations via getAllLocationTags() for autocomplete suggestions.';

-- GIN index for fast tag-based filtering (e.g. "find me all locations
-- tagged 'rooftop'").
CREATE INDEX IF NOT EXISTS atelier_locations_tags_gin_idx
  ON public.atelier_locations USING GIN (tags);
