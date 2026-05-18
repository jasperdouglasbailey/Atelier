-- 0064_defer_booking_ref_until_quote_sent.sql
--
-- Defer booking_ref assignment from creation time to first transition
-- into a "ref-lock" state (quote_sent or later).
--
-- Why
-- ---
-- Jasper 2026-05-18: bookings that die during brief intake or quote
-- drafting were burning BOOK-NNNN numbers. Cancelling a draft left a
-- gap in the sequence and the number was unrecoverable. With this
-- change, a booking has NO ref until it's first sent to a client (or
-- skipped past quote_sent into confirmed/paid/etc.). Cancelled drafts
-- never get a ref, so the sequence has no gaps from work that didn't
-- ship.
--
-- Once assigned, the ref is permanent — even if the booking is later
-- cancelled or written off. That's required for audit trail (the
-- client saw BOOK-NNNN on the quote; can't repurpose).
--
-- What changes
-- ------------
-- - Dropped: BEFORE INSERT trigger `trg_atelier_booking_ref` that
--   used to fire on every insert. From this migration on, creating a
--   booking leaves booking_ref = NULL.
-- - Added: function `atelier_assign_booking_ref_if_null(uuid)` that
--   assigns the next ref iff null. Idempotent — calling twice on the
--   same booking returns the existing ref without changing it.
-- - The server action `transitionStateAction` calls this function on
--   transitions to quote_sent / quote_confirmed / pre_production /
--   shoot_live / morning_after_check / post_production /
--   final_delivery / invoice_issued / paid. Bookings that skip
--   states (e.g. directly to invoice_issued from quote_drafted)
--   still get a ref.
--
-- What this does NOT change
-- -------------------------
-- - Existing booking_refs are untouched. The sequence picks up from
--   the current MAX.
-- - The race-condition profile is the same as before (MAX+1 is not
--   transactionally safe under concurrent inserts; for a single-
--   operator agency, that's fine).
-- - UI display: most surfaces already gracefully handle null ref via
--   `?? id.slice(0, 8)` or `?? title`. A few new fallbacks ship in
--   the same PR to cover the booking-detail page header.

DROP TRIGGER IF EXISTS trg_atelier_booking_ref ON public.atelier_bookings;

CREATE OR REPLACE FUNCTION public.atelier_assign_booking_ref_if_null(p_booking_id uuid)
  RETURNS text LANGUAGE plpgsql AS $$
DECLARE
  v_existing text;
  v_next_num integer;
  v_new_ref text;
BEGIN
  SELECT booking_ref INTO v_existing FROM public.atelier_bookings
    WHERE id = p_booking_id;
  IF v_existing IS NOT NULL THEN RETURN v_existing; END IF;

  SELECT COALESCE(MAX(CAST(SUBSTRING(booking_ref FROM 6) AS integer)), 0) + 1
    INTO v_next_num FROM public.atelier_bookings WHERE booking_ref IS NOT NULL;
  v_new_ref := 'BOOK-' || LPAD(v_next_num::text, 4, '0');

  UPDATE public.atelier_bookings
    SET booking_ref = v_new_ref
    WHERE id = p_booking_id AND booking_ref IS NULL;

  RETURN v_new_ref;
END $$;
