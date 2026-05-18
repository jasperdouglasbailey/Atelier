-- 0068_error_log.sql
--
-- Persistent error log for the app. Captures unhandled errors and
-- explicit captureError() calls so we have a queryable record of what
-- went wrong in production.
--
-- Why not Sentry: the npm install for @sentry/nextjs hit a local cache
-- permissions issue on the dev machine, and Sentry-in-production needs
-- account setup + DSN configuration outside the codebase. A self-hosted
-- Supabase table is zero-dep, queryable via SQL, and easy to swap to
-- Sentry later (just replace the inner writer in error-capture.ts).
--
-- RLS: owner/partner read-only. Inserts come from the service role via
-- the server-side writer (no client-side writes — too easy to spoof).

CREATE TABLE IF NOT EXISTS public.atelier_error_log (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  occurred_at timestamptz NOT NULL DEFAULT now(),
  /** "client" | "server" | "edge" | "cron" | "server_action" — where the error happened. */
  source      text NOT NULL,
  /** Short identifier; e.g. the route or action name. */
  context     text,
  /** Error.message, truncated to 500 chars to keep rows lean. */
  message     text NOT NULL,
  /** First ~2 KB of the stack trace. Truncated server-side before insert. */
  stack       text,
  /** Free-form JSON: user id, request path, action args (sanitised). */
  metadata    jsonb,
  /** Acting user when known (email or auth user id). */
  user_id     text
);

CREATE INDEX IF NOT EXISTS idx_atelier_error_log_occurred
  ON public.atelier_error_log (occurred_at DESC);

CREATE INDEX IF NOT EXISTS idx_atelier_error_log_source
  ON public.atelier_error_log (source, occurred_at DESC);

ALTER TABLE public.atelier_error_log ENABLE ROW LEVEL SECURITY;

-- Owner / partner read-only. Writes go through the service client only.
DROP POLICY IF EXISTS "error_log_owner_partner_read" ON public.atelier_error_log;
CREATE POLICY "error_log_owner_partner_read"
  ON public.atelier_error_log
  FOR SELECT
  USING (public.is_owner_or_partner());

COMMENT ON TABLE public.atelier_error_log IS
  'Captured application errors. Queryable via SQL for triage. Writes via service role only (see src/lib/utils/error-capture.ts).';
