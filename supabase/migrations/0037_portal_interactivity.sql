-- Portal interactivity: talent hold status + rate acceptance + brief sign-off + crew unavailability.
--
-- Talent assignments now mirror the crew hold-request pattern so artists
-- can confirm or decline a hold directly in their portal instead of via email.
-- Rate acceptance and brief acknowledgement create a paper trail without
-- requiring Jasper to chase manually.
--
-- Crew unavailability lets crew members self-report blocked dates so Jasper
-- sees conflicts in the booking-team picker before sending a hold request.

-- 1. Talent assignment — hold status + rate acceptance + brief sign-off ----------

ALTER TABLE public.atelier_booking_talent
  ADD COLUMN IF NOT EXISTS status text NOT NULL DEFAULT 'hold_requested'
    CHECK (status IN ('hold_requested', 'sent', 'confirmed', 'declined', 'released')),
  ADD COLUMN IF NOT EXISTS rate_accepted boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS rate_accepted_at timestamptz,
  ADD COLUMN IF NOT EXISTS brief_acknowledged_at timestamptz;

-- Backfill: rows where confirmed = true are already locked in — mark as confirmed.
UPDATE public.atelier_booking_talent SET status = 'confirmed' WHERE confirmed = true;

-- 2. Crew unavailability --------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.atelier_crew_unavailability (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at timestamptz NOT NULL DEFAULT now(),
  crew_id uuid NOT NULL REFERENCES public.atelier_crew(id) ON DELETE CASCADE,
  date_from date NOT NULL,
  date_to date NOT NULL,
  reason text,
  CHECK (date_to >= date_from)
);

CREATE INDEX IF NOT EXISTS idx_crew_unavail_crew    ON public.atelier_crew_unavailability (crew_id);
CREATE INDEX IF NOT EXISTS idx_crew_unavail_dates   ON public.atelier_crew_unavailability (date_from, date_to);

-- 3. RLS for crew_unavailability -----------------------------------------------

ALTER TABLE public.atelier_crew_unavailability ENABLE ROW LEVEL SECURITY;

CREATE POLICY "crew_unavail_owner_partner_all" ON public.atelier_crew_unavailability
  FOR ALL USING (is_owner_or_partner());

-- Crew see and manage only their own unavailability blocks.
CREATE POLICY "crew_unavail_crew_self" ON public.atelier_crew_unavailability
  FOR ALL USING (
    crew_id = (
      SELECT crew_id FROM public.atelier_app_users
      WHERE auth_user_id = auth.uid() AND role = 'crew'
      LIMIT 1
    )
  );
