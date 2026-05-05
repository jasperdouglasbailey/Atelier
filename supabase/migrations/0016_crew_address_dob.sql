-- Migration 0016: parity columns on atelier_crew
-- ----------------------------------------------------------
-- Adds home_address and dob to atelier_crew so the entity is on
-- equal footing with atelier_talent. Both fields are needed for
-- super lodgement and ATO/PAYG paperwork; we already collect them
-- for talent.
--
-- Also adds onboarding_token_expires_at on both tables so the
-- magic-link flow can reject stale tokens — talent has the column
-- already implicitly via the token, but neither table tracked an
-- expiry until now.
-- ----------------------------------------------------------

alter table atelier_crew
  add column if not exists home_address text,
  add column if not exists dob date,
  add column if not exists onboarding_token_expires_at timestamptz;

alter table atelier_talent
  add column if not exists onboarding_token_expires_at timestamptz;

-- Index the tokens for fast lookup on the magic-link route
create index if not exists idx_talent_onboarding_token on atelier_talent(onboarding_token) where onboarding_token is not null;
create index if not exists idx_crew_onboarding_token   on atelier_crew(onboarding_token)   where onboarding_token is not null;
