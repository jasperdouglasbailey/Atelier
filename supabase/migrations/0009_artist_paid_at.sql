-- Pay-on-paid tracking: record when we pay each artist / crew member.
-- Null = not yet paid, timestamptz = payment date recorded by Jasper.
-- Agency policy: artists are paid only after the client pays the agency.

alter table public.atelier_booking_talent
  add column if not exists artist_paid_at timestamptz;

alter table public.atelier_booking_crew
  add column if not exists artist_paid_at timestamptz;

comment on column public.atelier_booking_talent.artist_paid_at is
  'When Atelier paid this talent for the booking. Null = not yet paid.';
comment on column public.atelier_booking_crew.artist_paid_at is
  'When Atelier paid this crew member for the booking. Null = not yet paid.';
