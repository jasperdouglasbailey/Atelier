-- Migration 0071: Drop dead columns from atelier_bookings.
--
-- These columns are all either flagged @deprecated in the hand-types
-- (some since 2026-05-12) or confirmed unused during the bookings
-- simplification plan (`~/.claude/plans/pure-weaving-piglet.md`).
-- Dropping them now stops brief-parser writes to columns nothing reads,
-- simplifies the Booking interface, and frees the manual-create form
-- from a dead "End Brand" picker.
--
-- Dropped columns:
--   brand_id                  — "End Brand" picker, never re-editable
--                               after create, never displayed. Redundant
--                               given client + creative_agency exist.
--                               FK is dropped with the column.
--   talent_count              — Replaced by counting
--                               atelier_booking_talent rows.
--   talent_spec               — UI removed 2026-05-12; brief parser
--                               wrote it but nothing reads the value
--                               post-write.
--   looks_per_talent          — Never rendered in the redesigned
--                               JobFacts panel; the expander button
--                               label still mentioned it (cleaned up
--                               in PR 3 of this plan).
--   usage_media / usage_territory / usage_duration_months / usage_notes
--                             — Replaced by the structured usage
--                               taxonomy (migration 0059: usage_market,
--                               usage_realm, usage_media_categories,
--                               usage_specific_channels,
--                               usage_territory_iso) plus
--                               UsageLicenceBuilder.
--   retouch_note_format / video_references / wardrobe_responsibility
--                             — UI removed 2026-05-12; never re-added.
--
-- Tables we are NOT touching:
--   atelier_brands            — Stays. Campaigns still link to brands;
--                               only the FK from atelier_bookings is
--                               removed.
--
-- Reversibility:
--   Drops are destructive. Rolling back means restoring from backup
--   plus re-adding the columns. No data in production currently
--   depends on these values for any user-visible behaviour (verified
--   by grepping the codebase before this migration).

-- The atelier_bookings_portal view (created in PR#31 as a column-level RLS
-- layer for the talent + crew portals) selects four of the deprecated
-- columns we're dropping. Recreate it without them — the portal data
-- layer (src/lib/data/portal.ts) doesn't read those columns from the
-- view, so this is a no-op for the portal surfaces.
DROP VIEW IF EXISTS public.atelier_bookings_portal;

ALTER TABLE public.atelier_bookings
  DROP COLUMN IF EXISTS brand_id,
  DROP COLUMN IF EXISTS talent_count,
  DROP COLUMN IF EXISTS talent_spec,
  DROP COLUMN IF EXISTS looks_per_talent,
  DROP COLUMN IF EXISTS usage_media,
  DROP COLUMN IF EXISTS usage_territory,
  DROP COLUMN IF EXISTS usage_duration_months,
  DROP COLUMN IF EXISTS usage_notes,
  DROP COLUMN IF EXISTS retouch_note_format,
  DROP COLUMN IF EXISTS video_references,
  DROP COLUMN IF EXISTS wardrobe_responsibility;

-- Recreate the view with only the live columns. Same WHERE clause as
-- the original (PR#31): owner/partner sees all, talent sees their
-- bookings, crew sees theirs.
CREATE VIEW public.atelier_bookings_portal AS
  SELECT
    id,
    booking_ref,
    title,
    tier,
    state,
    shoot_dates,
    shoot_date_notes,
    shoot_location,
    deliverables_type,
    deliverables_count,
    post_production_ownership
  FROM public.atelier_bookings b
  WHERE is_owner_or_partner()
     OR EXISTS (
       SELECT 1 FROM public.atelier_booking_talent bt
        WHERE bt.booking_id = b.id AND bt.talent_id = current_talent_id()
     )
     OR EXISTS (
       SELECT 1 FROM public.atelier_booking_crew bc
        WHERE bc.booking_id = b.id AND bc.crew_id = current_crew_id()
     );
