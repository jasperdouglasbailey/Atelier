-- Per-day schedules for multi-day bookings.
-- Each row represents one shoot day with its own call time, wrap time,
-- location override, and notes. The call sheet reads from this table.

CREATE TABLE IF NOT EXISTS public.atelier_booking_schedules (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at timestamptz NOT NULL DEFAULT now(),
  booking_id uuid NOT NULL REFERENCES public.atelier_bookings(id) ON DELETE CASCADE,
  schedule_date date NOT NULL,
  call_time time,
  wrap_time time,
  location text,
  notes text,
  UNIQUE (booking_id, schedule_date)
);

CREATE INDEX IF NOT EXISTS idx_booking_schedules_booking ON public.atelier_booking_schedules (booking_id);

ALTER TABLE public.atelier_booking_schedules ENABLE ROW LEVEL SECURITY;

CREATE POLICY "booking_schedules_owner_partner_all" ON public.atelier_booking_schedules
  FOR ALL USING (is_owner_or_partner());

-- Portal users (talent/crew) can read schedules for bookings they are attached to.
CREATE POLICY "booking_schedules_portal_read" ON public.atelier_booking_schedules
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM public.atelier_booking_talent bt
      JOIN public.atelier_app_users au ON au.talent_id = bt.talent_id
      WHERE bt.booking_id = atelier_booking_schedules.booking_id
        AND au.user_id = auth.uid()
    )
    OR EXISTS (
      SELECT 1 FROM public.atelier_booking_crew bc
      JOIN public.atelier_app_users au ON au.crew_id = bc.crew_id
      WHERE bc.booking_id = atelier_booking_schedules.booking_id
        AND au.user_id = auth.uid()
    )
  );
