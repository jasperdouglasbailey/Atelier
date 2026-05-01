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

  // Allow-list check is silent — we never reveal denial.
  if (!isEmailAllowed(email)) {
    // Log the rejection server-side for the audit trail.
    console.warn('[auth] sign-in rejected (not in allowlist):', email);
    // But return success to the user. The "magic link" simply never arrives.
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
