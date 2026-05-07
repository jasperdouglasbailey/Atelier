-- Migration 0025: quote token expiry.
--
-- Until now, the public `/q/<token>` link generated at booking creation never
-- expires. If a client forwards a quote email six months later, the recipient
-- still sees the quote — and any stale prices, talent names, or financial
-- detail along with it.
--
-- This migration:
--   1. Adds `quote_token_expires_at timestamptz` to atelier_bookings.
--   2. Backfills the column to created_at + 180 days for every existing row.
--   3. Defaults future rows to now() + 180 days.
--
-- The viewer route at /q/[token] returns 410 Gone past expiry. Owner can
-- regenerate by updating the row (resets the expiry too — see comment).

alter table public.atelier_bookings
  add column if not exists quote_token_expires_at timestamptz;

-- Backfill: existing rows get a 180-day window from creation time.
update public.atelier_bookings
set quote_token_expires_at = created_at + interval '180 days'
where quote_token_expires_at is null;

-- Default for future rows (the booking insert path doesn't set this column,
-- so the DB default takes over).
alter table public.atelier_bookings
  alter column quote_token_expires_at set default (now() + interval '180 days');

-- Document expectations.
comment on column public.atelier_bookings.quote_token_expires_at is
  'Public /q/<token> link returns 410 Gone after this timestamp. To re-share, '
  'regenerate the token AND extend the expiry: '
  'update atelier_bookings set quote_token = gen_random_uuid(), '
  '  quote_token_expires_at = now() + interval ''180 days'' where id = ...';
