-- Migration 0070: Clients section overhaul (Phase B of pure-weaving-piglet plan)
--
-- Adds five fields the Syngency-inspired layout needs, and prepares the
-- single `address` column to split into physical + postal without breaking
-- existing reads. Doctrine reminder: banking lives in Xero ONLY — we add
-- `xero_contact_id` (a pointer to the Xero record) but no BSB / SWIFT / TFN
-- columns. See CLAUDE.md.
--
-- Fields added:
--   - address_physical    text          New canonical physical address.
--                                       Backfilled from `address` on this
--                                       migration; future write paths target
--                                       this column directly. `address` is
--                                       kept for one release as a read-only
--                                       fallback in the data layer.
--   - postal_address      text          Separate mailing/postal address when
--                                       a client invoices to a different
--                                       address than their office.
--   - tags                text[]        Free-form labels for filtering on the
--                                       index (e.g. magazine, agency, ecomm).
--                                       Mirrors the locations.tags pattern
--                                       added in migration 0054.
--   - xero_contact_id     text          UUID of the matched Xero contact, so
--                                       the detail page can deep-link out.
--                                       Text rather than uuid because Xero
--                                       contact IDs are their own format and
--                                       we don't want to assume.
--   - important_note      text          Short pinned note that always shows
--                                       on the detail page ("CC accounts@…"
--                                       kind of thing). Distinct from the
--                                       long-form `notes` column.
--   - primary_contact_email text        Optional pointer into the `contacts`
--                                       jsonb identifying which staff member
--                                       is the day-to-day primary. Email
--                                       chosen (over an index) because rows
--                                       can be reordered without breaking it.
--
-- Indexes: GIN on tags (same as locations.tags). No need for the others — all
-- are exact-match-by-id or single-column reads.

ALTER TABLE public.atelier_clients
  ADD COLUMN IF NOT EXISTS address_physical      text,
  ADD COLUMN IF NOT EXISTS postal_address        text,
  ADD COLUMN IF NOT EXISTS tags                  text[],
  ADD COLUMN IF NOT EXISTS xero_contact_id       text,
  ADD COLUMN IF NOT EXISTS important_note        text,
  ADD COLUMN IF NOT EXISTS primary_contact_email text;

-- Backfill address_physical from address for existing rows where it isn't
-- already set. Idempotent: re-running won't clobber a manually-edited
-- address_physical.
UPDATE public.atelier_clients
SET address_physical = address
WHERE address_physical IS NULL
  AND address IS NOT NULL;

COMMENT ON COLUMN public.atelier_clients.address_physical IS
  'Canonical physical address. Replaces `address` going forward; `address` is kept temporarily as a read-only fallback.';
COMMENT ON COLUMN public.atelier_clients.postal_address IS
  'Optional mailing/postal address when different from address_physical.';
COMMENT ON COLUMN public.atelier_clients.tags IS
  'User-defined free-form tags. Reused via getAllClientTags() for autocomplete suggestions and index filtering.';
COMMENT ON COLUMN public.atelier_clients.xero_contact_id IS
  'Pointer to the matched Xero contact record. Text rather than uuid because Xero contact IDs are their own format.';
COMMENT ON COLUMN public.atelier_clients.important_note IS
  'Short pinned note shown on every tab of the detail page. Distinct from long-form notes.';
COMMENT ON COLUMN public.atelier_clients.primary_contact_email IS
  'Optional pointer into the contacts jsonb identifying which staff member is the day-to-day primary.';

CREATE INDEX IF NOT EXISTS atelier_clients_tags_gin_idx
  ON public.atelier_clients USING GIN (tags);
