-- Add created_at to booking-team join tables so we can order by it.
-- Without this column, getTalentRatePrecedents and listTalentBookingHistory
-- silently fail and return empty arrays, which left the QuoteBuilder rate
-- precedents and talent booking-history pages blank.
--
-- Existing rows backfill from the parent booking's created_at where possible,
-- otherwise now(). Going forward, default = now().

alter table public.atelier_booking_talent
  add column if not exists created_at timestamptz not null default now();

alter table public.atelier_booking_crew
  add column if not exists created_at timestamptz not null default now();

-- Backfill: align existing assignments with their booking's creation time so
-- ordering by created_at makes chronological sense for rate-precedent queries.
update public.atelier_booking_talent bt
set created_at = b.created_at
from public.atelier_bookings b
where bt.booking_id = b.id
  and bt.created_at >= now() - interval '5 minutes';

update public.atelier_booking_crew bc
set created_at = b.created_at
from public.atelier_bookings b
where bc.booking_id = b.id
  and bc.created_at >= now() - interval '5 minutes';

comment on column public.atelier_booking_talent.created_at is 'When this artist was attached to the booking. Used for rate-precedent ordering.';
comment on column public.atelier_booking_crew.created_at   is 'When this crew member was attached to the booking. Used for ordering.';
