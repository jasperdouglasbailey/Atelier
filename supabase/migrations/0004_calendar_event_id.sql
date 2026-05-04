-- Persist the Google Calendar event ID created on quote_confirmed so the
-- app can link to it and update/cancel the event on state changes.

ALTER TABLE atelier_bookings
  ADD COLUMN IF NOT EXISTS calendar_event_id text;
