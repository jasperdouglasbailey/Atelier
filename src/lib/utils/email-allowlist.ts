/**
 * Email allow-list — EMERGENCY-OVERRIDE FALLBACK ONLY.
 *
 * As of migration 0068 the primary sign-in allowlist is DB-driven:
 * `public.is_signin_email_allowed(email)` joins atelier_app_users to
 * auth.users and returns true iff there's an active app-user. That's
 * the source of truth.
 *
 * This env var (`ATELIER_ALLOWED_EMAILS`) is kept as a fallback for:
 *   - Fresh prod databases where no app_users exist yet (chicken-and-egg
 *     bootstrap: first sign-in needs to happen before the operator can
 *     provision app_users).
 *   - Ops break-glass when the DB function is unreachable (e.g. RLS
 *     misconfig, transient outage) and someone needs in.
 *
 * In normal operation the env var stays empty. Adding an email here
 * effectively grants sign-in without an app_user row — use sparingly.
 *
 * Empty / unset env var → fallback is inert (dev mode + production-normal).
 */

export function getAllowedEmails(): string[] {
  const raw = process.env.ATELIER_ALLOWED_EMAILS;
  if (!raw) return [];
  return raw
    .split(',')
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);
}

export function isEmailAllowed(email: string): boolean {
  const list = getAllowedEmails();
  // Behaviour change 2026-05-19: empty env list now returns FALSE (not
  // true). The DB function is the primary check; an empty env-var
  // fallback shouldn't open every email to sign-in. Dev environments
  // bootstrap via DB seed of atelier_app_users like prod does.
  if (list.length === 0) return false;
  return list.includes(email.trim().toLowerCase());
}

/** True when the allow-list is enforced (production-style). */
export function isAllowlistEnforced(): boolean {
  return getAllowedEmails().length > 0;
}
