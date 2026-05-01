/**
 * Email allow-list — pilot-grade access control.
 *
 * Atelier is single-tenant at launch (Jasper is sole user, partners join
 * later). Magic-link auth is wide open by design — Supabase will send a
 * link to ANY email address typed into the form. To stop random people
 * from typing their own email and getting in, we require the email to
 * appear in the `ATELIER_ALLOWED_EMAILS` env var (comma-separated).
 *
 * When multi-user RBAC lands (see docs/RBAC.md), this is replaced by a
 * DB lookup against `atelier_user_links`. For now: env list = the floor.
 *
 * Empty / unset env var → allow all (dev mode). Production must set this.
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
  // Empty list = no env set = allow all (dev mode). Document this clearly.
  if (list.length === 0) return true;
  return list.includes(email.trim().toLowerCase());
}

/** True when the allow-list is enforced (production-style). */
export function isAllowlistEnforced(): boolean {
  return getAllowedEmails().length > 0;
}
