-- Migration 0021: column-level RLS for talent/crew portals
-- ----------------------------------------------------------
-- BACKGROUND
-- ----------
-- After the 0018 + 0019 RLS lockdown, talent and crew can read their
-- attached bookings via the `talent_attached_bookings` and
-- `crew_attached_bookings` policies. Those policies grant SELECT on the
-- *full row* of atelier_bookings — including columns the doctrine
-- explicitly says talent must NEVER see:
--
--   - client_id           (client identity)
--   - grand_total         (financial)
--   - budget_indication   (financial)
--   - agency_notes        (internal ops)
--   - brief_raw_text      (raw client email, may contain commercial info)
--   - quote_token         (the public viewer secret)
--
-- The portal pages already pull only safe columns via the application-layer
-- SELECT clause. But a talent or crew member who hits the Supabase REST
-- API directly (e.g. /rest/v1/atelier_bookings?select=*) bypasses the page
-- and gets everything. Postgres has no native column-level RLS, so the
-- standard pattern is: drop the row-level policies and route portal access
-- through a SECURITY DEFINER view that exposes only safe columns.
--
-- THIS MIGRATION
-- --------------
-- 1. Drops the talent_attached_bookings + crew_attached_bookings policies
--    on atelier_bookings.
-- 2. Creates atelier_bookings_portal as a SECURITY DEFINER view with its
--    own auth filter (is_owner_or_partner() OR attached as talent OR
--    attached as crew) and ONLY safe columns.
-- 3. Grants SELECT on the view to authenticated.
--
-- AFTER THIS MIGRATION
-- --------------------
--   Owner / partner: read atelier_bookings AND atelier_bookings_portal
--                    fully (owner_partner_full applies to base table).
--   Talent attached to a booking: cannot read atelier_bookings directly
--                                 (policy gone). Reads atelier_bookings_portal
--                                 → only the safe columns.
--   Crew attached to a booking:   same as talent.
--   Anyone else:                  cannot read either.
--
-- The portal data layer is updated in the same PR to query the view.
-- ----------------------------------------------------------

drop policy if exists talent_attached_bookings on public.atelier_bookings;
drop policy if exists crew_attached_bookings   on public.atelier_bookings;

-- security_invoker = off (the default) means the view runs with the
-- privileges of its owner. RLS on the base table doesn't apply to reads
-- through the view — the view's WHERE clause does the auth filter
-- explicitly using current_app_role() / current_talent_id() / current_crew_id().
create or replace view public.atelier_bookings_portal as
select
  b.id,
  b.booking_ref,
  b.title,
  b.tier,
  b.state,
  b.shoot_dates,
  b.shoot_date_notes,
  b.shoot_location,
  b.deliverables_type,
  b.deliverables_count,
  b.looks_per_talent,
  b.wardrobe_responsibility,
  b.post_production_ownership,
  b.retouch_note_format,
  b.video_references
  -- Deliberately omitted (talent/crew should not see):
  --   client_id, creative_agency_id, brand_id (could imply client),
  --   agency_notes, brief_raw_text, brief_parsed_at, brief_parser_version,
  --   grand_total, budget_indication,
  --   usage_media, usage_territory, usage_duration_months, usage_notes,
  --   talent_spec, selects_cadence,
  --   quote_token, drive_folder_id, drive_folder_link,
  --   final_delivery_at, final_delivered_by,
  --   ot_window_locked_at, ot_window_locked_by,
  --   confirmed_at, payment_received_at,
  --   created_at, updated_at  (not sensitive but not useful in portal)
from public.atelier_bookings b
where
  is_owner_or_partner()
  or exists (
    select 1 from public.atelier_booking_talent bt
     where bt.booking_id = b.id and bt.talent_id = current_talent_id()
  )
  or exists (
    select 1 from public.atelier_booking_crew bc
     where bc.booking_id = b.id and bc.crew_id = current_crew_id()
  );

-- The view inherits the security context of its owner (postgres),
-- but PostgREST still requires a grant to expose it via the API.
grant select on public.atelier_bookings_portal to authenticated;

comment on view public.atelier_bookings_portal is
  'Column-restricted projection of atelier_bookings for talent + crew portals. '
  'Excludes client identity, financial totals, agency notes, brief text. '
  'Authorisation enforced inline (is_owner_or_partner() OR booking_talent OR '
  'booking_crew). Owner/partner can also read atelier_bookings directly via '
  'the owner_partner_full policy on the base table. See migration 0021 for '
  'rationale.';
