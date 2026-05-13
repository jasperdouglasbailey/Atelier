-- Tasks system — user-created tasks assignable to owner/partner with due dates.
-- Tasks can be attached to a booking, talent, or crew member.
-- atelier_app_users PK is user_id (uuid).

CREATE TABLE IF NOT EXISTS public.atelier_tasks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid REFERENCES public.atelier_app_users(user_id) ON DELETE SET NULL,
  assigned_to uuid REFERENCES public.atelier_app_users(user_id) ON DELETE SET NULL,
  title text NOT NULL,
  description text,
  due_at timestamptz,
  completed_at timestamptz,
  -- polymorphic attachment: one of these may be set
  booking_id uuid REFERENCES public.atelier_bookings(id) ON DELETE CASCADE,
  talent_id uuid REFERENCES public.atelier_talent(id) ON DELETE CASCADE,
  crew_id uuid REFERENCES public.atelier_crew(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_tasks_booking   ON public.atelier_tasks (booking_id) WHERE booking_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_tasks_talent    ON public.atelier_tasks (talent_id)  WHERE talent_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_tasks_crew      ON public.atelier_tasks (crew_id)    WHERE crew_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_tasks_assigned  ON public.atelier_tasks (assigned_to);
CREATE INDEX IF NOT EXISTS idx_tasks_due       ON public.atelier_tasks (due_at)     WHERE completed_at IS NULL;

ALTER TABLE public.atelier_tasks ENABLE ROW LEVEL SECURITY;

-- Only owner/partner can create, read, update, delete tasks.
CREATE POLICY "tasks_owner_partner_all" ON public.atelier_tasks
  FOR ALL USING (is_owner_or_partner());
