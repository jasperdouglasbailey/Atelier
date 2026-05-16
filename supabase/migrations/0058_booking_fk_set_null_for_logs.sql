-- 0058_booking_fk_set_null_for_logs.sql
--
-- Four booking-id foreign keys were still set to NO ACTION (block on
-- delete) when they should be SET NULL — they reference log / state-
-- machine / cache tables whose rows should outlive the booking they
-- describe but should NOT prevent the booking from being deleted.
--
-- Symptom: deleteBookingAction on a terminal-state booking returned
-- false because atelier_events had 9 transition-history rows pointing
-- at the booking. Postgres raised foreign_key_violation on the parent
-- delete; the data layer surfaced it as a boolean false, so the UI
-- showed "Delete returned false — check logs for details" with no
-- actionable detail.
--
-- After this migration:
--   - atelier_events.booking_id          → SET NULL on delete
--   - atelier_approvals.booking_id       → SET NULL on delete
--   - atelier_idempotency_keys.booking_id → SET NULL on delete
--   - atelier_llm_calls.booking_id       → SET NULL on delete (intended
--     by migration 0036 per its comment, but the constraint never got
--     re-issued because it already existed with NO ACTION).
--
-- Cascade behaviour is unchanged for the booking_talent / booking_crew /
-- fee_lines / schedules / tasks / quote_versions / usage_licences
-- relationships — those rows ARE specific to the booking and should
-- die with it.

ALTER TABLE public.atelier_events
  DROP CONSTRAINT IF EXISTS atelier_events_booking_id_fkey,
  ADD CONSTRAINT atelier_events_booking_id_fkey
    FOREIGN KEY (booking_id) REFERENCES public.atelier_bookings(id)
    ON DELETE SET NULL;

ALTER TABLE public.atelier_approvals
  DROP CONSTRAINT IF EXISTS atelier_approvals_booking_id_fkey,
  ADD CONSTRAINT atelier_approvals_booking_id_fkey
    FOREIGN KEY (booking_id) REFERENCES public.atelier_bookings(id)
    ON DELETE SET NULL;

ALTER TABLE public.atelier_idempotency_keys
  DROP CONSTRAINT IF EXISTS atelier_idempotency_keys_booking_id_fkey,
  ADD CONSTRAINT atelier_idempotency_keys_booking_id_fkey
    FOREIGN KEY (booking_id) REFERENCES public.atelier_bookings(id)
    ON DELETE SET NULL;

ALTER TABLE public.atelier_llm_calls
  DROP CONSTRAINT IF EXISTS atelier_llm_calls_booking_id_fkey,
  ADD CONSTRAINT atelier_llm_calls_booking_id_fkey
    FOREIGN KEY (booking_id) REFERENCES public.atelier_bookings(id)
    ON DELETE SET NULL;
