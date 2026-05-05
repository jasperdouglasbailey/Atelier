-- Migration 0011: Locations / Studios
--
-- Jasper's location library — known studios, venues, and outdoor spaces.
-- Referenced from bookings and pre-fills the brief parser when a known
-- location name appears in raw text.

CREATE TABLE IF NOT EXISTS public.atelier_locations (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now(),

  -- Identity
  name          text NOT NULL,          -- "Studio 5", "The Cullen Hotel"
  alias         text,                   -- Common shorthand, e.g. "S5"
  studio_type   text NOT NULL DEFAULT 'photo_studio',
    -- photo_studio | film_studio | outdoor | retail | residential | venue | other

  -- Address
  address       text,                   -- Full street address
  suburb        text,                   -- Quick lookup on booking form
  state         text NOT NULL DEFAULT 'NSW',
  postcode      text,

  -- Contact
  contact_name  text,
  contact_email text,
  contact_phone text,
  website       text,

  -- Rates (AUD, ex-GST, per day unless noted)
  half_day_rate numeric,
  full_day_rate numeric,
  weekend_surcharge_pct numeric,        -- e.g. 0.25 = 25% weekend surcharge
  rate_notes    text,                   -- "Power included; catering separate"

  -- Facilities & logistics
  facilities    text[],                 -- e.g. ['change_rooms', 'kitchen', 'wifi']
  parking_notes text,
  access_notes  text,                   -- Key code, arrival instructions, etc.
  square_metres numeric,
  max_capacity  integer,

  -- Internal
  notes         text,                   -- Anything else Jasper wants to remember
  is_active     boolean NOT NULL DEFAULT true
);

-- RLS: same full-access policy pattern as all other atelier tables
alter table public.atelier_locations enable row level security;

create policy "Owner full access — locations"
  on public.atelier_locations
  for all
  using (auth.uid() is not null)
  with check (auth.uid() is not null);

-- Updated-at trigger (reuse existing function if it exists)
create or replace function public.atelier_set_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger atelier_locations_updated_at
  before update on public.atelier_locations
  for each row execute function public.atelier_set_updated_at();

comment on table public.atelier_locations is
  'Known studios, venues, and outdoor spaces used by Saunders & Co bookings.';
