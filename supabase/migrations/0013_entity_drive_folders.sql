-- Migration 0013: Drive folders for clients, talent, and crew
--
-- Mirrors the pattern from migration 0012 (locations).
-- A folder is created automatically on entity insert; the link is stored
-- on the row so Jasper can jump straight to it from the entity detail view.
--
-- Folder hierarchy in Drive (under the Atelier root):
--   Clients/  └── {Client Name}
--   Talent/   └── {Working Name}
--   Crew/     └── {Crew Name}
--
-- Per Rule 9 (PII boundary): Drive folders are NEVER used for banking
-- details, passport scans, driver's licence scans, or WWCC scans.
-- Those live in the atelier-private-docs Supabase Storage bucket only.
-- These Drive folders are intended for portfolio material, signed
-- engagement letters (non-PII parts), and reference work.

alter table public.atelier_clients
  add column if not exists drive_folder_id   text,
  add column if not exists drive_folder_link text;

alter table public.atelier_talent
  add column if not exists drive_folder_id   text,
  add column if not exists drive_folder_link text;

alter table public.atelier_crew
  add column if not exists drive_folder_id   text,
  add column if not exists drive_folder_link text;

comment on column public.atelier_clients.drive_folder_id   is 'Google Drive folder ID for this client (auto-created).';
comment on column public.atelier_clients.drive_folder_link is 'Drive webViewLink for this client folder.';
comment on column public.atelier_talent.drive_folder_id    is 'Google Drive folder ID for this artist (portfolio + non-PII docs).';
comment on column public.atelier_talent.drive_folder_link  is 'Drive webViewLink for this artist folder.';
comment on column public.atelier_crew.drive_folder_id      is 'Google Drive folder ID for this crew member (portfolio + non-PII docs).';
comment on column public.atelier_crew.drive_folder_link    is 'Drive webViewLink for this crew folder.';
