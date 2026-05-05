-- Migration 0012: Location studio rooms + Google Drive folder link
--
-- studio_rooms: JSON array of room specs for multi-room studios.
--   Each element: { id, name, half_day_rate, full_day_rate,
--                   weekend_surcharge_pct, square_metres, max_capacity,
--                   features [], notes }
--
-- drive_folder_id / drive_folder_link: populated automatically when a new
--   location is saved (the server action calls the Drive API).

alter table public.atelier_locations
  add column if not exists studio_rooms      jsonb,
  add column if not exists drive_folder_id   text,
  add column if not exists drive_folder_link text;

comment on column public.atelier_locations.studio_rooms is
  'JSON array of individual studio room specs for multi-room locations.';
comment on column public.atelier_locations.drive_folder_id is
  'Google Drive folder ID for this location (auto-created).';
comment on column public.atelier_locations.drive_folder_link is
  'Google Drive folder webViewLink — direct URL for Jasper.';
