-- Migration 0024: Add communication_style to atelier_clients
--
-- Controls the register / tone used in all outbound emails to this client.
-- Separate from preferred_comms (which is the *channel* — email/sms/phone).
-- Used by: quote-chase cron, post-shoot-chase cron, brief-clarify auto-trigger.
--
--   formal  — professional prose, full sentences, "Dear / Regards"
--   casual  — existing Jasper voice (direct, concise, "Hi / Best")
--   terse   — very short, bullet/list style, minimum words
--   null    — defaults to casual (Jasper's base voice)

ALTER TABLE atelier_clients
  ADD COLUMN IF NOT EXISTS communication_style varchar
  CHECK (communication_style IN ('formal', 'casual', 'terse'));
