-- Fix: atelier_dismissed_brief_candidates.dismissed_by must be text, not uuid.
--
-- Migration 0051 declared dismissed_by as `uuid REFERENCES auth.users(id)` but
-- the application uses `getCurrentActor()` which returns the user's email
-- (preferring user.email over user.id) — same pattern as audit_log.user_id.
-- Inserting an email into a uuid column crashed with:
--   invalid input syntax for type uuid: "jasperdouglasbailey@gmail.com"
--
-- Reported by Jasper after attempting to dismiss potential briefs. The
-- optimistic-hide reverted on error so the messages reappeared without
-- refresh — that's the error-recovery path working, but the underlying
-- write never succeeded.
--
-- Fix: drop the FK constraint, change column type to text. Matches the
-- audit_log.user_id pattern. We don't need referential integrity for this
-- column — it's a record of who dismissed, not a relationship.

ALTER TABLE public.atelier_dismissed_brief_candidates
  DROP CONSTRAINT IF EXISTS atelier_dismissed_brief_candidates_dismissed_by_fkey;

ALTER TABLE public.atelier_dismissed_brief_candidates
  ALTER COLUMN dismissed_by TYPE text USING dismissed_by::text;
