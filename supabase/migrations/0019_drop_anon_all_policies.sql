-- Migration 0019: drop the wide-open *_anon_all policies that bypass RLS.
-- ----------------------------------------------------------
-- CRITICAL — these policies pre-date our work (most likely a Supabase
-- "permissive" preset or an early dev workaround). They look like:
--
--   CREATE POLICY "atelier_<table>_anon_all" ON <table>
--     FOR ALL TO public USING (true);
--
-- `roles=public` matches every Postgres role including `anon` and
-- `authenticated`. `qual=true` makes them allow-all. They effectively
-- short-circuit every other policy, including the role-based scoping
-- 0018 just installed.
--
-- Dropping them makes 0018's policies actually take effect.
--
-- Public flows that legitimately need to bypass RLS (e.g. the
-- /q/[token] quote viewer, /onboard/[token] form, /api/onboard,
-- runHealthProbes) all use the service client which bypasses RLS by
-- design. So dropping these policies should not regress any public path.
-- ----------------------------------------------------------

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
    'atelier_quote_versions','atelier_talent','atelier_usage_licences'
  ]
  loop
    execute format('drop policy if exists %I on public.%I',
      format('%s_anon_all', tbl), tbl);
  end loop;
end $$;
