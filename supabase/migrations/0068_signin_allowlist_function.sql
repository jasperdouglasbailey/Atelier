-- 0068_signin_allowlist_function.sql
--
-- Replaces the env-var sign-in allowlist (ATELIER_ALLOWED_EMAILS) with
-- a DB-driven check against atelier_app_users.
--
-- Bug fixed: Jasper provisioned Gary in atelier_app_users as a partner,
-- but Gary's email wasn't in ATELIER_ALLOWED_EMAILS. The sign-in action
-- silently dropped his magic-link request and the only signal was a
-- server-log line. Two sources of truth was always going to bite eventually;
-- email-allowlist.ts itself flagged this with the comment "will be replaced
-- by DB lookup when multi-user RBAC lands."
--
-- This migration adds `public.is_signin_email_allowed(text)` — a SECURITY
-- DEFINER function that joins atelier_app_users to auth.users via user_id
-- and returns true iff there's an active app-user with that email. Anon
-- has EXECUTE permission so the unauthenticated login form can call it
-- via supabase.rpc() before signInWithOtp.
--
-- Search-path is pinned to mitigate the SECURITY DEFINER privilege-
-- escalation pattern (CVE-style attacks via schema injection).

CREATE OR REPLACE FUNCTION public.is_signin_email_allowed(email_input text)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, auth, pg_temp
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.atelier_app_users au
    JOIN auth.users u ON u.id = au.user_id
    WHERE LOWER(u.email) = LOWER(email_input)
      AND au.is_active = true
  );
$$;

-- Lock down the default PUBLIC grant, then re-grant to the roles that
-- actually need it. anon = unauthenticated login form. authenticated =
-- for any future re-validation flows.
REVOKE EXECUTE ON FUNCTION public.is_signin_email_allowed(text) FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION public.is_signin_email_allowed(text) TO anon, authenticated;

COMMENT ON FUNCTION public.is_signin_email_allowed(text) IS
  'Single source of truth for who can request a magic link. Returns true iff an active atelier_app_users row exists for the email-resolved user_id. SECURITY DEFINER so anon can read auth.users.email indirectly. Called from src/app/actions/auth.ts before supabase.auth.signInWithOtp.';
