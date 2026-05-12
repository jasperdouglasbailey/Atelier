-- Fix ON DELETE CASCADE for the four tables that reference atelier_bookings
-- without it. Any booking with events, approvals, LLM call records, or
-- idempotency keys was failing with a FK constraint violation on delete.
--
-- atelier_events         → CASCADE  (timeline events belong to the booking)
-- atelier_approvals      → CASCADE  (approval requests belong to the booking)
-- atelier_llm_calls      → SET NULL (cost records are useful even without the booking)
-- atelier_idempotency_keys → CASCADE (keys are meaningless after the booking is gone)

ALTER TABLE public.atelier_events
  DROP CONSTRAINT IF EXISTS atelier_events_booking_id_fkey,
  ADD CONSTRAINT atelier_events_booking_id_fkey
    FOREIGN KEY (booking_id) REFERENCES public.atelier_bookings(id) ON DELETE CASCADE;

ALTER TABLE public.atelier_approvals
  DROP CONSTRAINT IF EXISTS atelier_approvals_booking_id_fkey,
  ADD CONSTRAINT atelier_approvals_booking_id_fkey
    FOREIGN KEY (booking_id) REFERENCES public.atelier_bookings(id) ON DELETE CASCADE;

ALTER TABLE public.atelier_llm_calls
  DROP CONSTRAINT IF EXISTS atelier_llm_calls_booking_id_fkey,
  ADD CONSTRAINT atelier_llm_calls_booking_id_fkey
    FOREIGN KEY (booking_id) REFERENCES public.atelier_bookings(id) ON DELETE SET NULL;

ALTER TABLE public.atelier_idempotency_keys
  DROP CONSTRAINT IF EXISTS atelier_idempotency_keys_booking_id_fkey,
  ADD CONSTRAINT atelier_idempotency_keys_booking_id_fkey
    FOREIGN KEY (booking_id) REFERENCES public.atelier_bookings(id) ON DELETE CASCADE;
