-- Migration 0022: track when the quote was sent
-- ----------------------------------------------------------
-- The quote-chase cron (PR #32) needs to know how long ago a booking
-- entered `quote_sent` state. We could parse the audit log for the
-- relevant transition row, but it's cleaner to track the milestone
-- directly — same pattern as `invoice_issued_at`, `paid_at`,
-- `final_delivery_at`.
--
-- Backfill: any booking currently at or past `quote_sent` gets its
-- `quote_sent_at` set to `updated_at` as a best-guess. Bookings that
-- have moved on (artists_crew_held, confirmed, ...) had their
-- updated_at touched again so the value will be late, but the chase
-- cron only operates on `state='quote_sent'` so the backfill quality
-- doesn't actually matter for current bookings.
-- ----------------------------------------------------------

alter table atelier_bookings
  add column if not exists quote_sent_at timestamptz;

-- Backfill: best-guess for bookings already at or past quote_sent.
update atelier_bookings
   set quote_sent_at = coalesce(quote_sent_at, updated_at)
 where state in (
   'quote_sent', 'artists_crew_held', 'quote_confirmed',
   'pre_production', 'shoot_live', 'morning_after_check', 'post_production',
   'final_delivery', 'invoice_issued', 'paid', 'released'
 );

-- Index used by the quote-chase cron's WHERE clause.
create index if not exists idx_bookings_quote_sent_at
  on atelier_bookings (quote_sent_at)
  where quote_sent_at is not null;
