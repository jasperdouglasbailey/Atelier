-- Talent unavailability — mirrors atelier_crew_unavailability from migration 0037.
-- Talent can self-report blocked dates via their portal so Jasper sees
-- conflicts in the booking-team picker before sending a hold request.

CREATE TABLE IF NOT EXISTS public.atelier_talent_unavailability (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at timestamptz NOT NULL DEFAULT now(),
  talent_id uuid NOT NULL REFERENCES public.atelier_talent(id) ON DELETE CASCADE,
  date_from date NOT NULL,
  date_to date NOT NULL,
  reason text,
  CHECK (date_to >= date_from)
);

CREATE INDEX IF NOT EXISTS idx_talent_unavail_talent ON public.atelier_talent_unavailability (talent_id);
CREATE INDEX IF NOT EXISTS idx_talent_unavail_dates  ON public.atelier_talent_unavailability (date_from, date_to);

ALTER TABLE public.atelier_talent_unavailability ENABLE ROW LEVEL SECURITY;

CREATE POLICY "talent_unavail_owner_partner_all" ON public.atelier_talent_unavailability
  FOR ALL USING (is_owner_or_partner());

-- Talent see and manage only their own unavailability blocks.
CREATE POLICY "talent_unavail_talent_self" ON public.atelier_talent_unavailability
  FOR ALL USING (
    talent_id = (
      SELECT talent_id FROM public.atelier_app_users
      WHERE user_id = auth.uid() AND role = 'talent'
      LIMIT 1
    )
  );
