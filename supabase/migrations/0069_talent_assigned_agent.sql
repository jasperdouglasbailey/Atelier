-- 0069_talent_assigned_agent.sql
--
-- Phase 1 of the multi-agent agency rollout: every talent gets an
-- "assigned agent" — the human at the agency who owns the relationship
-- with that artist by default. Multiple agents inside one agency can
-- now divide the roster between them.
--
-- - "Default view = my artists" UI filter keys off this column.
-- - Multi-agent bookings (one client wants Oliver AND Maria, who are
--   on different agents' rosters) work for free: each agent sees the
--   booking because their talent is on the team. No special routing.
-- - Reassignment is a column update; past bookings stay attributed
--   via the audit log; present/future bookings flow with the artist.
--
-- RLS deliberately unchanged in this migration. Today the agency
-- operates with full trust between agents (sick cover, holiday) and
-- both owners and partners need to see everything. The "my artists"
-- view is enforced at the UI / data-layer level. When multi-tenancy
-- lands (per-agency isolation), RLS gets tightened.

ALTER TABLE public.atelier_talent
  ADD COLUMN IF NOT EXISTS assigned_agent_user_id UUID
    REFERENCES public.atelier_app_users(user_id) ON DELETE SET NULL;

COMMENT ON COLUMN public.atelier_talent.assigned_agent_user_id IS
  'The human agent at the agency who owns this artist''s relationship by default. Used by the UI "my artists" filter and as the default booking owner when this talent is added to a team. NULL = unassigned (visible to everyone). Constrained to atelier_app_users so the agent must be a provisioned account; a check constraint enforcing role IN (owner, partner) lives separately so it can be relaxed without dropping the FK.';

CREATE INDEX IF NOT EXISTS idx_atelier_talent_assigned_agent
  ON public.atelier_talent(assigned_agent_user_id)
  WHERE assigned_agent_user_id IS NOT NULL;

-- Backfill: assign every existing talent to the first active owner of
-- the agency. For Saunders today that's Jasper. The operator can
-- reassign to Gary or Jemma via the talent profile (Phase 1 UI).
--
-- Idempotent: only touches rows still NULL. Safe to re-run.
UPDATE public.atelier_talent
SET assigned_agent_user_id = (
  SELECT user_id
  FROM public.atelier_app_users
  WHERE role = 'owner' AND is_active = true
  ORDER BY created_at ASC
  LIMIT 1
)
WHERE assigned_agent_user_id IS NULL;
