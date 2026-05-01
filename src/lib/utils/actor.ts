/**
 * Current Actor Helper
 *
 * Returns the identifier for the current user, used in audit logs and
 * event tracking. Reads from the Supabase Auth session — when no user
 * is signed in (e.g. during background scheduled tasks, or in dev when
 * Supabase isn't configured yet), returns the system fallback.
 *
 * Every call site is already async, so the Supabase roundtrip is fine.
 * Supabase's session lookup is cached in the request context.
 */

import { createClient } from '@/lib/supabase/server';

const SYSTEM_ACTOR = 'system';
const DEV_FALLBACK_ACTOR = 'jasper';  // pre-Supabase-configured dev mode

/**
 * Returns the current acting user's identifier (email, falling back to
 * Supabase user ID, falling back to a system marker).
 *
 * Priority:
 *   1. Supabase auth session email
 *   2. Supabase auth session user ID
 *   3. 'jasper' (dev mode — when SUPABASE env not configured)
 *   4. 'system' (auth configured but no session — e.g. cron job)
 */
export async function getCurrentActor(): Promise<string> {
  // Dev mode: no Supabase configured yet → return Jasper as before.
  if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY) {
    return DEV_FALLBACK_ACTOR;
  }

  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (user?.email) return user.email;
    if (user?.id) return user.id;
    return SYSTEM_ACTOR;
  } catch (err) {
    // Supabase call failed — log but don't crash the audit-log write.
    console.error('[actor] failed to read session', err);
    return SYSTEM_ACTOR;
  }
}

/**
 * Synchronous fallback for code paths that genuinely cannot await
 * (very rare). Always returns 'system'. Prefer the async version.
 */
export function getCurrentActorSync(): string {
  return SYSTEM_ACTOR;
}
