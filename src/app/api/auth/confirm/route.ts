/**
 * Magic-link confirm route.
 *
 * Supabase redirects the user here after they click the email link.
 *
 * Two flows are possible depending on Supabase auth config:
 *   1. PKCE (default for @supabase/ssr) — link arrives with `?code=xxx`,
 *      we call `exchangeCodeForSession(code)` to swap for a session.
 *   2. OTP token-hash (legacy) — link arrives with `?token_hash=xxx&type=magiclink`,
 *      we call `verifyOtp({token_hash, type})`.
 *
 * If neither query param is present, the link is malformed OR Supabase put
 * the error in the URL hash fragment (#error=...) — server can't see hash,
 * so we redirect to /login with a generic-but-truthful error code. The
 * client-side login page reads the hash and displays the specific reason.
 *
 * Allowlist check happens AFTER session is established (defence in depth) —
 * a user might have been removed from the allowlist between sending and
 * clicking, or the link could be replayed.
 */

import { type NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { isEmailAllowed } from '@/lib/utils/email-allowlist';
import type { EmailOtpType } from '@supabase/supabase-js';
import type { SupabaseClient, User } from '@supabase/supabase-js';

export async function GET(request: NextRequest) {
  const { searchParams, origin } = new URL(request.url);
  const next = searchParams.get('next') ?? '/';

  // Supabase sometimes returns errors in the query string directly.
  const queryError = searchParams.get('error');
  if (queryError) {
    const desc = searchParams.get('error_description') ?? 'unknown';
    console.warn('[auth/confirm] error in query string', { queryError, desc });
    return NextResponse.redirect(new URL('/login?error=link_expired', origin));
  }

  const supabase = await createClient();

  // Path A — PKCE flow (default with @supabase/ssr)
  const code = searchParams.get('code');
  if (code) {
    const { data, error } = await supabase.auth.exchangeCodeForSession(code);
    if (error || !data.user) {
      console.error('[auth/confirm] PKCE exchange failed', error);
      return NextResponse.redirect(new URL('/login?error=link_expired', origin));
    }
    return finalize(data.user, supabase, origin, next);
  }

  // Path B — OTP token-hash flow (legacy, still supported)
  const token_hash = searchParams.get('token_hash');
  const type = searchParams.get('type') as EmailOtpType | null;
  if (token_hash && type) {
    const { data, error } = await supabase.auth.verifyOtp({ token_hash, type });
    if (error || !data.user) {
      console.error('[auth/confirm] OTP verify failed', error);
      return NextResponse.redirect(new URL('/login?error=link_expired', origin));
    }
    return finalize(data.user, supabase, origin, next);
  }

  // No recognised query params. The actual cause is most likely an error in
  // the hash fragment (which the server cannot see). The login page parses
  // the hash and displays the real reason.
  console.warn('[auth/confirm] no auth params in query — likely hash-fragment error');
  return NextResponse.redirect(new URL('/login?error=link_expired', origin));
}

async function finalize(
  user: User,
  supabase: SupabaseClient,
  origin: string,
  next: string,
): Promise<NextResponse> {
  const email = user.email?.toLowerCase();
  if (email && !isEmailAllowed(email)) {
    console.warn('[auth/confirm] post-verify allowlist rejection:', email);
    await supabase.auth.signOut();
    return NextResponse.redirect(new URL('/login?error=not_authorised', origin));
  }
  return NextResponse.redirect(new URL(next, origin));
}
