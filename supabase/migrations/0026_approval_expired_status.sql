-- Migration 0026: add 'expired' to the approval-status enum.
--
-- Pending approval drafts older than 30 days are auto-expired by the
-- data-retention cron (api/cron/data-retention). This keeps the inbox
-- focused on active work and prevents Jasper from accidentally approving
-- a stale draft whose underlying booking has moved on.
--
-- The hard-delete sweep (>180 days) deletes the row entirely.
-- The soft sweep (>30 days, still pending) marks it expired but keeps
-- the row so the audit trail can show why it didn't go out.

alter type public.atelier_approval_status
  add value if not exists 'expired';
