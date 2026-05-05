-- Row Level Security — owner-only access for all Atelier tables.
--
-- Policy: any authenticated Supabase user can read/write all rows.
-- Multi-user scoping (per partner account) will be added in a future
-- migration when partner accounts (Jemma, Gary) are introduced.
--
-- Public/token-gated routes (/q/[token], /api/onboard) use the service
-- role client at the application layer and are never subject to RLS.

-- Enable RLS on every table
alter table public.atelier_bookings        enable row level security;
alter table public.atelier_clients         enable row level security;
alter table public.atelier_talent          enable row level security;
alter table public.atelier_crew            enable row level security;
alter table public.atelier_brands          enable row level security;
alter table public.atelier_campaigns       enable row level security;
alter table public.atelier_booking_talent  enable row level security;
alter table public.atelier_booking_crew    enable row level security;
alter table public.atelier_quote_versions  enable row level security;
alter table public.atelier_fee_lines       enable row level security;
alter table public.atelier_usage_licences  enable row level security;
alter table public.atelier_events          enable row level security;
alter table public.atelier_approvals       enable row level security;
alter table public.atelier_audit_log       enable row level security;
alter table public.atelier_llm_calls       enable row level security;
alter table public.atelier_kill_switch     enable row level security;

-- Authenticated-user full-access policies (using 'if not exists' guard via DO block)
do $$
declare
  tbl text;
begin
  foreach tbl in array array[
    'atelier_bookings','atelier_clients','atelier_talent','atelier_crew',
    'atelier_brands','atelier_campaigns','atelier_booking_talent',
    'atelier_booking_crew','atelier_quote_versions','atelier_fee_lines',
    'atelier_usage_licences','atelier_events','atelier_approvals',
    'atelier_audit_log','atelier_llm_calls','atelier_kill_switch'
  ]
  loop
    execute format(
      'create policy if not exists "auth_full_access" on public.%I
       for all using (auth.uid() is not null)
       with check (auth.uid() is not null)',
      tbl
    );
  end loop;
end $$;
