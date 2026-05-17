-- 0061_crew_prefix_and_orphan_fix_part2.sql
--
-- Part 2 of the fee-line clarity refactor. Migrates existing rows to use
-- the new `crew_overtime` and `crew_travel` enum values added in 0060.
--
-- Split from 0060 because Postgres requires ALTER TYPE ADD VALUE to
-- commit before the new value can be referenced (you can't add and use
-- a new enum value in the same transaction). 0060 adds the values;
-- 0061 (a separate migration = separate transaction) does the UPDATE.
--
-- The bare `overtime` and `travel` enum values STAY in the type
-- definition after this migration — we don't drop them. Dropping enum
-- values requires recreating the type, which briefly locks the table.
-- The dead values cost nothing; app code uses only the new prefixed
-- names going forward.
--
-- Per-row scope: from the prod frequency check (2026-05-17), 4 rows use
-- `overtime` (total $480) and 0 rows use `travel`. So this migration
-- touches at most 4 rows.

UPDATE public.atelier_fee_lines
SET line_type = 'crew_overtime'
WHERE line_type = 'overtime';

UPDATE public.atelier_fee_lines
SET line_type = 'crew_travel'
WHERE line_type = 'travel';
