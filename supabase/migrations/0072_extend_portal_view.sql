-- Migration 0072: Extend atelier_bookings_portal view so the talent portal
-- can render the full JobFacts shape (not just title + dates + location).
--
-- Context. The portal view (created PR#31, rebuilt PR#216 / migration 0071)
-- only exposed a handful of columns to talent + crew portals. The result:
-- when a talent accepted a hold, their portal showed nothing but the title,
-- date, location, day-rate. They couldn't see call times, deliverables,
-- producer contact, post-production owner, usage taxonomy, or the
-- confirmation deadline — all of which they need to plan + sign off.
--
-- This migration drops + recreates the view with the additional columns
-- listed below. Same RLS-equivalent WHERE clause: owner/partner sees all;
-- talent sees rows they're on; crew sees rows they're on.
--
-- COLUMNS ADDED:
--   call_time / wrap_time         — start + finish for the day
--   producer_name / producer_phone / producer_email
--                                 — primary client contact on shoot day
--   creative_agency_id            — context: who's running the brief
--   confirmation_deadline         — hard date for client confirm
--   grade_retouch_scope           — paired with post_production_ownership
--   usage_market / usage_realm / usage_media_categories /
--     usage_specific_channels / usage_territory_iso
--                                 — what the images are for
--
-- COLUMNS DELIBERATELY NOT EXPOSED:
--   budget_indication, agency_notes, po_number, job_number, important_note
--                                 — internal; agency-side only

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
    -- New columns surfaced 2026-05-19.
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
    usage_territory_iso
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
