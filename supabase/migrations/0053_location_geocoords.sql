-- Migration 0053: Geocoordinates on locations for the interactive map.
--
-- latitude / longitude — populated by a server-side geocode call (Nominatim,
--   free, no API key) when the address changes. NULL when geocoding hasn't
--   run yet or failed — those locations stay in the list but don't appear
--   on the map.
-- geocoded_address — the address string we last geocoded against. Used to
--   detect when re-geocoding is needed (address changed since last save).

ALTER TABLE public.atelier_locations
  ADD COLUMN IF NOT EXISTS latitude         numeric,
  ADD COLUMN IF NOT EXISTS longitude        numeric,
  ADD COLUMN IF NOT EXISTS geocoded_address text;

COMMENT ON COLUMN public.atelier_locations.latitude IS
  'Decimal degrees, geocoded from address. NULL when not yet geocoded or geocoding failed.';
COMMENT ON COLUMN public.atelier_locations.longitude IS
  'Decimal degrees, geocoded from address. NULL when not yet geocoded or geocoding failed.';
COMMENT ON COLUMN public.atelier_locations.geocoded_address IS
  'The full address string we last geocoded against. Compare to current address to detect when re-geocoding is needed.';
