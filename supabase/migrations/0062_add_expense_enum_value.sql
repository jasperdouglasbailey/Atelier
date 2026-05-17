-- 0062_add_expense_enum_value.sql
--
-- Phase 3/3 of the fee-line simplification (2026-05-18) — part 1 of 2.
--
-- Adds the `expense` enum value so migration 0063 can remap rows to use
-- it. ALTER TYPE ADD VALUE has to commit before the value can be
-- referenced, so this is split into its own migration (= its own
-- transaction) ahead of the UPDATE in 0063.
--
-- IF NOT EXISTS guard makes this idempotent. Applied to prod via
-- Supabase MCP on 2026-05-18 ahead of 0063.

ALTER TYPE atelier_fee_line_type ADD VALUE IF NOT EXISTS 'expense';
