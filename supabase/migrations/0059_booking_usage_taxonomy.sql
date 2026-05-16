-- 0059_booking_usage_taxonomy.sql
--
-- Structured advertising-media + market-realm taxonomy for bookings.
-- Backs the LLM-extracted fields surfaced in PR #169 (brief-intake) so
-- they can persist beyond the in-memory BriefIntakeResult.
--
-- The taxonomy is the canonical reference Jasper shared:
--   market: consumer | trade | editorial
--   realm:  advertising | promotional | pr | corporate | editorial
--   media categories: online | broadcast | print | outdoor | ambient
--
-- Specific channels (e.g. "edm", "billboard", "pos") are stored as
-- snake_case strings rather than an enum — the long tail evolves as
-- new media types emerge and we don't want a migration per channel.
--
-- Territories are ISO 3166-1 alpha-2 codes — e.g. ["AU", "NZ"]. The
-- pre-existing `usage_territory_raw` text column stays as-is so we
-- don't lose the originally-written phrasing ("Australia and New
-- Zealand", "Aus.", etc.).
--
-- All five columns are NULLABLE — old briefs (no LLM extraction) and
-- new briefs where the LLM didn't return the field both leave them
-- empty. CHECK constraints enforce the enum vocabulary for the two
-- scalar fields.

ALTER TABLE public.atelier_bookings
  ADD COLUMN IF NOT EXISTS usage_market text
    CHECK (usage_market IS NULL OR usage_market IN ('consumer', 'trade', 'editorial'));

ALTER TABLE public.atelier_bookings
  ADD COLUMN IF NOT EXISTS usage_realm text
    CHECK (usage_realm IS NULL OR usage_realm IN ('advertising', 'promotional', 'pr', 'corporate', 'editorial'));

-- Top-level media categories. Enforced via array-element CHECK so callers
-- can't smuggle in unknown values.
ALTER TABLE public.atelier_bookings
  ADD COLUMN IF NOT EXISTS usage_media_categories text[]
    DEFAULT '{}'::text[];

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'atelier_bookings_media_categories_check') THEN
    ALTER TABLE public.atelier_bookings
      ADD CONSTRAINT atelier_bookings_media_categories_check
      CHECK (
        usage_media_categories IS NULL OR
        usage_media_categories <@ ARRAY['online', 'broadcast', 'print', 'outdoor', 'ambient']::text[]
      );
  END IF;
END $$;

-- Specific channels — snake_case strings. No enum constraint; the set
-- grows with the industry.
ALTER TABLE public.atelier_bookings
  ADD COLUMN IF NOT EXISTS usage_specific_channels text[]
    DEFAULT '{}'::text[];

-- ISO 3166-1 alpha-2 territory codes. Postgres doesn't allow subqueries
-- in CHECK constraints, so the allowlist is inlined as an array literal.
ALTER TABLE public.atelier_bookings
  ADD COLUMN IF NOT EXISTS usage_territory_iso text[]
    DEFAULT '{}'::text[];

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'atelier_bookings_territory_iso_check') THEN
    ALTER TABLE public.atelier_bookings
      ADD CONSTRAINT atelier_bookings_territory_iso_check
      CHECK (
        usage_territory_iso IS NULL OR
        usage_territory_iso <@ ARRAY[
          'AU','NZ','US','GB','UK','CA','DE','FR','IT','ES','NL','BE','SE','NO','DK','FI','IE',
          'JP','KR','CN','HK','TW','SG','MY','TH','VN','PH','ID','IN','AE','SA','QA','IL',
          'ZA','BR','MX','AR','CL','CO','PE','RU','PL','CZ','AT','CH','GR','PT','TR','UA',
          'WW','EU','EMEA','APAC','LATAM','AMET','GCC','NORDICS','MENA'
        ]::text[]
      );
  END IF;
END $$;

-- Note on the WW/EU/regional pseudo-codes: we accept a handful of
-- region aggregates that aren't strict ISO ("WW" for worldwide, "EU"
-- for European Union, "EMEA" for Europe/Middle East/Africa) because
-- the LLM frequently extracts these from briefs that use shorthand.
-- Treating them as valid ISO-ish keeps the constraint useful without
-- forcing post-hoc normalisation.
