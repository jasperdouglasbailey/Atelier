-- Migration 0018: RLS lockdown — flip from auth_full_access to role-based.
-- ----------------------------------------------------------
-- Phase 5b. The infrastructure (atelier_app_users + helpers) shipped
-- in 0017; this migration is the actual access flip.
--
-- BEFORE: any authenticated user had full access to every table
--         (auth_full_access in 0010).
-- AFTER:  owner / partner roles still have full access. Talent and
--         crew roles can SELECT their own row + their own assignments
--         + the bookings they're attached to.
--         Users with no atelier_app_users row see nothing.
--
-- Column-level filtering (e.g. hiding client_id from talent viewing
-- their booking) is NOT done here — that's a follow-up. Row-level
-- scoping is the immediate doctrine-aligned win and matches what the
-- portal pages already render.
--
-- Tables explicitly handled below: every owner-domain table with the
-- old auth_full_access policy, plus the locations tables added later.
-- The corpus, audit, llm_calls and app_users tables are intentionally
-- NOT widened to talent/crew — those stay owner/partner-only.
-- ----------------------------------------------------------

-- 1. Drop the old auth_full_access policy from every table that had it.
do $$
declare
  tbl text;
begin
  foreach tbl in array array[
    'atelier_approvals','atelier_audit_log','atelier_booking_crew',
    'atelier_booking_talent','atelier_bookings','atelier_brands',
    'atelier_campaigns','atelier_client_brands','atelier_clients',
    'atelier_crew','atelier_events','atelier_fee_lines',
    'atelier_idempotency_keys','atelier_kill_switch','atelier_llm_calls',
    'atelier_locations','atelier_quote_versions','atelier_talent',
    'atelier_usage_licences'
  ]
  loop
    execute format('drop policy if exists "auth_full_access" on public.%I', tbl);
  end loop;
end $$;

-- 2. Add owner/partner full-access on every table that had auth_full_access.
do $$
declare
  tbl text;
begin
  foreach tbl in array array[
    'atelier_approvals','atelier_audit_log','atelier_booking_crew',
    'atelier_booking_talent','atelier_bookings','atelier_brands',
    'atelier_campaigns','atelier_client_brands','atelier_clients',
    'atelier_crew','atelier_events','atelier_fee_lines',
    'atelier_idempotency_keys','atelier_kill_switch','atelier_llm_calls',
    'atelier_locations','atelier_quote_versions','atelier_talent',
    'atelier_usage_licences'
  ]
  loop
    begin
      execute format(
        'create policy "owner_partner_full" on public.%I
         for all using (is_owner_or_partner())
         with check (is_owner_or_partner())',
        tbl
      );
    exception when duplicate_object then null;
    end;
  end loop;
end $$;

-- 3. Talent self-scoped read policies.
--    Talent can SELECT their own atelier_talent row, their own
--    atelier_booking_talent rows, and the bookings those rows reference.
do $$
begin
  -- own talent row
  begin
    create policy "talent_self_read" on atelier_talent
      for select using (
        current_app_role() = 'talent' and id = current_talent_id()
      );
  exception when duplicate_object then null;
  end;

  -- own booking_talent rows (joins to bookings)
  begin
    create policy "talent_self_assignments" on atelier_booking_talent
      for select using (
        current_app_role() = 'talent' and talent_id = current_talent_id()
      );
  exception when duplicate_object then null;
  end;

  -- bookings the talent is attached to. Done via EXISTS to avoid
  -- recursive policy evaluation (referencing atelier_booking_talent
  -- inside an atelier_bookings policy is fine because PostgreSQL
  -- evaluates each table's policies independently).
  begin
    create policy "talent_attached_bookings" on atelier_bookings
      for select using (
        current_app_role() = 'talent'
        and exists (
          select 1 from atelier_booking_talent bt
          where bt.booking_id = atelier_bookings.id
            and bt.talent_id  = current_talent_id()
        )
      );
  exception when duplicate_object then null;
  end;
end $$;

-- 4. Crew self-scoped read policies. Mirror of the talent block.
do $$
begin
  begin
    create policy "crew_self_read" on atelier_crew
      for select using (
        current_app_role() = 'crew' and id = current_crew_id()
      );
  exception when duplicate_object then null;
  end;

  begin
    create policy "crew_self_assignments" on atelier_booking_crew
      for select using (
        current_app_role() = 'crew' and crew_id = current_crew_id()
      );
  exception when duplicate_object then null;
  end;

  begin
    create policy "crew_attached_bookings" on atelier_bookings
      for select using (
        current_app_role() = 'crew'
        and exists (
          select 1 from atelier_booking_crew bc
          where bc.booking_id = atelier_bookings.id
            and bc.crew_id    = current_crew_id()
        )
      );
  exception when duplicate_object then null;
  end;
end $$;

-- 5. Sanity comment on what's deliberately NOT widened:
--    atelier_audit_log, atelier_llm_calls, atelier_kill_switch — admin only
--    atelier_clients, atelier_brands, atelier_campaigns — admin only
--      (privacy doctrine: talent never sees client identity)
--    atelier_fee_lines — admin only (contains other people's rates)
--    atelier_quote_versions, atelier_usage_licences — admin only
--    atelier_approvals, atelier_events — admin only
--    atelier_locations, atelier_locations_rooms — admin only for now
--    atelier_corpus_bookings, atelier_app_users — already had their own
--      RLS from earlier migrations.
