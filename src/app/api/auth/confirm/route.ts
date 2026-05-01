/**
 * Magic-link confirm route.
 *
 * Supabase redirects the user here after they click the email link.
 * URL shape: /api/auth/confirm?token_hash=...&type=email
 *
 * We exchange the token for a session, set the cookie, then redirect
 * to the path in `next` (or to / if no `next`).
 */

import { type NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { isEmailAllowed } from '@/lib/utils/email-allowlist';
import type { EmailOtpType } from '@supabase/supabase-js';

export async function GET(request: NextRequest) {
  const { searchParams, origin } = new URL(request.url);
  const token_hash = searchParams.get('token_hash');
  const type = searchParams.get('type') as EmailOtpType | null;
  const next = searchParams.get('next') ?? '/';

  if (!token_hash || !type) {
    return NextResponse.redirect(new URL('/login?error=invalid_link', origin));
  }

  const supabase = await createClient();
  const { data, error } = await supabase.auth.verifyOtp({ token_hash, type });

  if (error || !data.user) {
    console.error('[auth/confirm] verify failed', error);
    return NextResponse.redirect(new URL('/login?error=link_expired', origin));
  }

  // Belt-and-braces: re-check the allow-list at confirm time. A user might
  // have been removed from the allow-list between sending and clicking,
  // or the link could be replayed. Allow-list is enforced at BOTH gates.
  const email = data.user.email?.toLowerCase();
  if (email && !isEmailAllowed(email)) {
    console.warn('[auth/confirm] post-verify allowlist rejection:', email);
    await supabase.auth.signOut();
    return NextResponse.redirect(new URL('/login?error=not_authorised', origin));
  }

  return NextResponse.redirect(new URL(next, origin));
}
