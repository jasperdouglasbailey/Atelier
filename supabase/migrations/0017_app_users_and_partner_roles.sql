-- Migration 0017: app_users + role infrastructure
-- ----------------------------------------------------------
-- Lays the groundwork for Phase 5 RLS lockdown without yet flipping
-- the existing auth_full_access policy. The next migration (after the
-- talent/crew portals exist in Phase 6) replaces auth_full_access
-- with the scoped policies declared by current_app_role().
--
-- Roles:
--   owner    — Jasper. Full access. Default for the founding user.
--   partner  — Jemma, Gary. Full access. Same powers as owner.
--   talent   — represented artist. Sees own row + own booking_talent +
--              limited fields on bookings they're attached to.
--   crew     — freelance crew. Same as talent but via crew_id.
--
-- The talent_id / crew_id columns link an auth.users row to the
-- corresponding atelier_talent or atelier_crew row. This is what the
-- portal pages will use to scope queries.
-- ----------------------------------------------------------

create table if not exists atelier_app_users (
  user_id        uuid primary key references auth.users(id) on delete cascade,
  role           text not null check (role in ('owner','partner','talent','crew')),
  display_name   text,
  -- Linkage to domain entities — filled in for talent/crew roles, null for owner/partner
  talent_id      uuid references atelier_talent(id) on delete set null,
  crew_id        uuid references atelier_crew(id)   on delete set null,
  -- Operational
  is_active      boolean not null default true,
  created_at     timestamptz not null default now(),
  invited_at     timestamptz,
  last_seen_at   timestamptz,
  -- Sanity check: a row can have a talent OR a crew linkage, not both.
  -- Owner/partner have neither.
  constraint app_user_role_linkage check (
    (role = 'talent'  and talent_id is not null and crew_id is null) or
    (role = 'crew'    and crew_id   is not null and talent_id is null) or
    (role in ('owner','partner') and talent_id is null and crew_id is null)
  )
);

create index if not exists idx_app_users_role      on atelier_app_users(role);
create index if not exists idx_app_users_talent_id on atelier_app_users(talent_id) where talent_id is not null;
create index if not exists idx_app_users_crew_id   on atelier_app_users(crew_id)   where crew_id is not null;

-- ----------------------------------------------------------
-- Helper functions — used by future RLS policies.
-- ----------------------------------------------------------

-- Returns the role of the currently authenticated user, or null if
-- there's no atelier_app_users row (i.e. an auth user that has signed
-- in but isn't yet provisioned). Callers should treat null as "no
-- role" — UI gates should require a non-null role.
create or replace function current_app_role()
returns text
language sql
stable
security definer
as $$
  select role from atelier_app_users where user_id = auth.uid();
$$;

-- True if the caller is owner or partner (admin-level access).
create or replace function is_owner_or_partner()
returns boolean
language sql
stable
security definer
as $$
  select coalesce(
    (select role in ('owner','partner') from atelier_app_users where user_id = auth.uid()),
    false
  );
$$;

-- The talent_id linked to the caller, or null. Used by the future
-- talent-portal RLS policies.
create or replace function current_talent_id()
returns uuid
language sql
stable
security definer
as $$
  select talent_id from atelier_app_users where user_id = auth.uid() and role = 'talent';
$$;

create or replace function current_crew_id()
returns uuid
language sql
stable
security definer
as $$
  select crew_id from atelier_app_users where user_id = auth.uid() and role = 'crew';
$$;

-- ----------------------------------------------------------
-- RLS on the new table itself
-- ----------------------------------------------------------

alter table atelier_app_users enable row level security;

-- Anyone authenticated can read their OWN row (so the app can resolve
-- their role on every page load).
do $$
begin
  begin
    create policy "self_read_app_users"
      on atelier_app_users for select
      using (user_id = auth.uid());
  exception when duplicate_object then null;
  end;

  -- Owner/partner can read all rows
  begin
    create policy "admin_read_app_users"
      on atelier_app_users for select
      using (is_owner_or_partner());
  exception when duplicate_object then null;
  end;

  -- Only owner/partner can mutate. (We avoid letting users elevate
  -- themselves — owner provisions partner/talent/crew rows.)
  begin
    create policy "admin_write_app_users"
      on atelier_app_users for all
      using (is_owner_or_partner())
      with check (is_owner_or_partner());
  exception when duplicate_object then null;
  end;
end $$;
