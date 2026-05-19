'use server';

/**
 * Auth server actions — magic-link sign-in + sign-out.
 *
 * Doctrine: passwordless. Jasper enters his email, Supabase mails him a
 * one-time link, clicking it sets the session cookie. No password to
 * forget; no password vault to compromise.
 *
 * Security:
 *   - Email allow-list (`ATELIER_ALLOWED_EMAILS`) checked BEFORE we ask
 *     Supabase to send anything. Random people can't email-flood the
 *     system or learn whether an account exists.
 *   - We DO NOT reveal whether an email is on the allow-list. Both
 *     allowed and denied emails get the same generic "check your email"
 *     response — preventing enumeration attacks.
 */

import { redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';
import { createClient } from '@/lib/supabase/server';
import { isEmailAllowed } from '@/lib/utils/email-allowlist';
import { createServiceClient } from '@/lib/supabase/service';

export type SignInResult =
  | { ok: true }
  | { ok: false; error: string };

/**
 * Send a magic link to the given email address.
 * Returns the same generic success message regardless of whether the
 * email is on the allow-list — to prevent enumeration.
 */
export async function signInWithEmailAction(formData: FormData): Promise<SignInResult> {
  const email = (formData.get('email') as string | null)?.trim().toLowerCase();
  if (!email || !email.includes('@')) {
    return { ok: false, error: 'Please enter a valid email address.' };
  }

  // Allow-list check — single source of truth is now the DB.
  // is_signin_email_allowed() (migration 0068) joins atelier_app_users to
  // auth.users by email and returns true iff there's an active app-user.
  // The env-var ATELIER_ALLOWED_EMAILS stays as an emergency-override
  // fallback for bootstrap scenarios (fresh prod DB before any app_users
  // exist, ops break-glass) — fall back to it only when the DB check
  // returns false.
  //
  // Either way, an unrecognised email gets a silent generic success — we
  // never reveal denial, to prevent enumeration of who's on the platform.
  const adminSupabase = createServiceClient();
  const { data: dbAllowed, error: dbErr } = await adminSupabase.rpc(
    'is_signin_email_allowed',
    { email_input: email },
  );
  if (dbErr) {
    // Don't reveal DB errors to the client either. Log + fall through to
    // the env-var fallback so a transient DB problem doesn't lock everyone out.
    console.error('[auth] is_signin_email_allowed RPC failed', dbErr);
  }

  const allowed = dbAllowed === true || isEmailAllowed(email);
  if (!allowed) {
    console.warn('[auth] sign-in rejected (no active app_user, not in env override):', email);
    return { ok: true };
  }

  const supabase = await createClient();
  const origin = process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000';

  const { error } = await supabase.auth.signInWithOtp({
    email,
    options: {
      // Where Supabase sends the user after they click the email link.
      // The route at /api/auth/confirm exchanges the token for a session.
      emailRedirectTo: `${origin}/api/auth/confirm`,
      shouldCreateUser: true,  // first-time users get auto-created on first link
    },
  });

  if (error) {
    console.error('[auth] signInWithOtp failed', error);
    return { ok: false, error: 'Could not send the link. Try again in a moment.' };
  }

  return { ok: true };
}

/**
 * Sign out and redirect to /login.
 */
export async function signOutAction(): Promise<void> {
  const supabase = await createClient();
  await supabase.auth.signOut();
  revalidatePath('/', 'layout');
  redirect('/login');
}
