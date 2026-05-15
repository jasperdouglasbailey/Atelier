-- AUDIT-2026-05-15 P1: client legal/company name stored as "Wpp Production".
--
-- titleCaseName() now respects mixed-case input correctly (CLAUDE.md #30),
-- so a fresh save won't re-corrupt it. But existing rows that were inserted
-- when the title-caser was more aggressive remain in their corrupted state.
--
-- Surface area: client name appears on dashboard top-artists, /bookings
-- list/calendar/board, /clients list, and on every quote/invoice PDF
-- attributed to this client. Cosmetic but visible everywhere.
--
-- Both `name` and `company` columns are patched defensively — the public
-- quote viewer falls back from `company` to `name`, so either column being
-- wrong would show. Conditional WHERE clauses keep the migration idempotent
-- (no-op on second run; no-op on environments where the row never existed).

UPDATE atelier_clients
   SET name = 'WPP Production'
 WHERE name = 'Wpp Production';

UPDATE atelier_clients
   SET company = 'WPP Production'
 WHERE company = 'Wpp Production';
