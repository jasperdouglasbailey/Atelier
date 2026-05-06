-- Migration 0020: dietary/drink/city metadata on crew + talent
-- ----------------------------------------------------------
-- Adds the four fields agency call sheets use to brief clients:
--   - city            : home base, used for the crew filter dropdown
--                       (Sydney, Melbourne, Byron Bay/Gold Coast,
--                        Brisbane, Adelaide, Paris, London, ...)
--   - dietary         : free text. NIL, vegan, gluten free, "no chicken"
--   - drink_order     : free text. "Long black", "Strong oat cap"
--
-- Crew also gets `kit_list` (already on the type but never on the edit
-- form) — no schema change there, just a UI gap to close.
--
-- Talent gets the same three columns for parity (artists give us
-- dietary/drink and home base too).
-- ----------------------------------------------------------

alter table atelier_crew
  add column if not exists city text,
  add column if not exists dietary text,
  add column if not exists drink_order text;

alter table atelier_talent
  add column if not exists city text,
  add column if not exists dietary text,
  add column if not exists drink_order text;

-- Indexes for the city filter dropdown — small cardinality so a
-- partial index keyed on non-null values is cheap.
create index if not exists idx_crew_city
  on atelier_crew (city)
  where city is not null;

create index if not exists idx_talent_city
  on atelier_talent (city)
  where city is not null;
