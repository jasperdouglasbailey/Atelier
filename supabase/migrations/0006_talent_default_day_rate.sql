-- Add default_day_rate to atelier_talent so the BookingTeam form can
-- pre-fill the day rate when adding an artist to a booking.
alter table atelier_talent add column if not exists default_day_rate numeric;

comment on column atelier_talent.default_day_rate is
  'Suggested day rate for this artist — pre-fills the booking-team add form.';
