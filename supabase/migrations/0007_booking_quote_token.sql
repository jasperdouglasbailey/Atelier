-- Opaque token for the client-facing public quote viewer (/q/[token]).
-- Generated automatically on row creation; safe to include in emails.
-- To invalidate a link, regenerate with: update atelier_bookings set quote_token = gen_random_uuid() where id = '...';
alter table atelier_bookings
  add column if not exists quote_token uuid not null default gen_random_uuid();

create unique index if not exists atelier_bookings_quote_token_idx
  on atelier_bookings (quote_token);

comment on column atelier_bookings.quote_token is
  'Opaque UUID included in the /q/[token] public quote link sent to clients.';
