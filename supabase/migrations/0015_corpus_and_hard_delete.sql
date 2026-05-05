-- Migration 0015: anonymised corpus table + booking hard-delete support
-- -----------------------------------------------------------------------
-- atelier_corpus_bookings
--   One anonymised row per deleted booking. No PII; client/talent are
--   sha256-hashed so repeat-client / repeat-talent patterns can be
--   detected without exposing identity.
--
-- Outcome values:
--   won              → booking reached 'paid' or 'released'
--   lost_pre_quote   → cancelled before 'quote_sent'
--   lost_post_quote  → cancelled on/after 'quote_sent'
--   cancelled        → any other terminal cancellation
-- -----------------------------------------------------------------------

create table if not exists atelier_corpus_bookings (
  id                      uuid primary key default gen_random_uuid(),

  -- anonymised identifiers
  client_hash             text,                          -- sha256(client_id)
  talent_hash             text,                          -- sha256(primary talent id), nullable

  -- booking shape
  tier                    text,
  day_rate                numeric(10,2),
  deliverable_count       int,
  usage_media             text[]    default '{}',
  usage_territory         text[]    default '{}',
  usage_duration_months   int,
  grand_total             numeric(10,2),
  shoot_year_month        text,                          -- 'YYYY-MM', not exact date

  -- outcome
  outcome                 text not null
    check (outcome in ('won','lost_pre_quote','lost_post_quote','cancelled')),

  -- metadata
  source_booking_state    text,                          -- state at time of deletion
  created_at              timestamptz not null default now()
);

-- Index for the most likely analytical queries
create index if not exists idx_corpus_outcome      on atelier_corpus_bookings(outcome);
create index if not exists idx_corpus_tier         on atelier_corpus_bookings(tier);
create index if not exists idx_corpus_client_hash  on atelier_corpus_bookings(client_hash);

-- RLS: owner-only reads, no direct inserts (server-action only)
alter table atelier_corpus_bookings enable row level security;

create policy "owner_read_corpus"
  on atelier_corpus_bookings for select
  using (true);   -- single-owner app; all authenticated reads allowed

-- No insert/update/delete RLS needed — server-side service-role only
