-- Add 'written_off' terminal state for bookings where the client won't pay.
-- invoice_issued → written_off exits the normal payment path and marks the
-- debt as unrecoverable. An anonymised corpus row is still written (same as
-- cancel / release) so trend data stays intact.
--
-- Reuses cancellation_reason column to store the write-off reason — no new
-- column needed since the semantics are identical (why this booking ended
-- without being paid).

ALTER TYPE public.atelier_booking_state ADD VALUE IF NOT EXISTS 'written_off' AFTER 'cancelled';
