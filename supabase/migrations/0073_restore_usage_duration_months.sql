-- Migration 0073: Restore usage_duration_months on atelier_bookings.
--
-- Why this column comes back. Migration 0071 dropped usage_duration_months
-- alongside the legacy free-text usage_* columns (usage_media, usage_territory,
-- usage_notes), on the reasoning that the structured taxonomy fields
-- (usage_market / usage_realm / usage_media_categories /
-- usage_specific_channels / usage_territory_iso) replaced them all.
--
-- That was wrong for duration. The taxonomy describes WHAT the images
-- are for (market / realm / media / channels / territories) — it has no
-- slot for HOW LONG the licence runs. "6 months" / "1 year" / "in
-- perpetuity" is a structured integer the LLM brief intake already
-- extracts; we just had nowhere to put it. Jasper flagged it: usage
-- duration was missing from the apply preview.
--
-- The column is added back as nullable. The brief-intake apply path
-- (applyBriefSuggestionsAction) gets a write for it; UsageSummary
-- renders it as the first slot of the territory line so it pairs
-- naturally ("6 months · Australia + New Zealand"). The portal view
-- (atelier_bookings_portal) is recreated to include it so talent see
-- it on their hold cards too.

ALTER TABLE public.atelier_bookings
  ADD COLUMN IF NOT EXISTS usage_duration_months integer;

COMMENT ON COLUMN public.atelier_bookings.usage_duration_months IS
  'Licence duration in months. Brief-intake LLM extracts this from natural-language phrases ("6 months", "1 year", "in perpetuity" → 999). Complements the structured taxonomy which describes scope-of-use; this one describes length-of-use.';

-- Recreate atelier_bookings_portal view with the new column so talent +
-- crew portals surface it. Same RLS-equivalent WHERE clause as before.
DROP VIEW IF EXISTS public.atelier_bookings_portal;

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
    post_production_ownership,
    call_time,
    wrap_time,
    producer_name,
    producer_phone,
    producer_email,
    creative_agency_id,
    confirmation_deadline,
    grade_retouch_scope,
    usage_market,
    usage_realm,
    usage_media_categories,
    usage_specific_channels,
    usage_territory_iso,
    usage_duration_months
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
