-- 0060_crew_prefix_and_orphan_fix_part1.sql
--
-- Part 1 of the fee-line clarity refactor (Jasper-approved 2026-05-17).
--
-- (a) Strip the 2 orphan `is_artist_reimbursement = true AND talent_id IS NULL`
--     rows. Pre-flight SQL on prod identified exactly these two rows; both
--     are equipment lines on Oliver Begg bookings (BOOK-0002, BOOK-0006).
--     Jasper chose Path A (conservative): treat as agency-paid, strip the
--     flag. Safe — if either turns out to be Oliver's personal spend, we
--     can re-link talent_id later. Worst case: Oliver mentions it, we fix.
--     (Alternative was Path B = link to Oliver = $4,100 phantom reimbursement
--     if either was actually agency-paid.)
--
-- (b) Add `crew_overtime` and `crew_travel` enum values. These are
--     prefix-matched names for the currently-bare `overtime` and `travel`
--     types — `artist_overtime` / `artist_travel` already exist, so the
--     bare variants are confusingly asymmetric. The actual UPDATE of
--     existing rows to use the new values happens in migration 0061
--     because Postgres requires ALTER TYPE ADD VALUE to commit before
--     new values can be referenced in the same session.

-- Idempotent strip. Defensive WHERE: only act if the row is still in
-- the bad state (is_artist_reimbursement = true AND talent_id IS NULL).
-- Re-running is a no-op.
UPDATE public.atelier_fee_lines
SET is_artist_reimbursement = false
WHERE id IN (
  'b6660358-5b18-4248-a406-9d293bbedfaf',  -- BOOK-0006 Peter Alexander Campaign, $3,600 equipment
  'fb0960f4-26ee-4886-90a8-dd2088f8d21c'   -- BOOK-0002 Venroy Resort Drop SS26, $500 equipment
)
AND is_artist_reimbursement = true
AND talent_id IS NULL;

-- Add the new enum values. IF NOT EXISTS guards make this safe to re-run.
ALTER TYPE atelier_fee_line_type ADD VALUE IF NOT EXISTS 'crew_overtime';
ALTER TYPE atelier_fee_line_type ADD VALUE IF NOT EXISTS 'crew_travel';
