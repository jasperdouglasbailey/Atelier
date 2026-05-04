-- Drive folder IDs persisted per booking so the app can reference them
-- without re-querying Drive on every page load.
--
--   drive_root_id   — Drive file ID of the top-level booking folder
--   drive_folder_ids — JSONB blob: { briefs, selects, retouched, finals, admin }
--   drive_root_link — webViewLink for the root folder (human-clickable)
--
-- Columns are nullable; they are populated when the booking reaches
-- quote_confirmed and Drive folders are created.

ALTER TABLE atelier_bookings
  ADD COLUMN IF NOT EXISTS drive_root_id      text,
  ADD COLUMN IF NOT EXISTS drive_folder_ids   jsonb,
  ADD COLUMN IF NOT EXISTS drive_root_link    text;
