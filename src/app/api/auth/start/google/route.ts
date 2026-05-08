/**
 * Kick off the Google OAuth flow.
 *
 * Visiting this endpoint redirects to Google's consent screen with the
 * full scope list. After the user approves, Google redirects back to
 * /api/auth/callback/google which surfaces the refresh token.
 *
 * A random `state` token is generated here, stored in a short-lived
 * httpOnly cookie, and validated in the callback to prevent CSRF attacks.
 *
 * Idempotent — safe to hit multiple times.
 */

import { NextRequest, NextResponse } from 'next/server';
import { buildAuthorizationUrl } from '@/lib/integrations/google-auth';
import { randomBytes } from 'crypto';

export async function GET(request: NextRequest) {
  const { origin } = new URL(request.url);
  const redirectUri = process.env.GOOGLE_REDIRECT_URI ?? `${origin}/api/auth/callback/google`;

  try {
    // Generate a random state token and store in a short-lived cookie.
    // The callback validates this before accepting the OAuth code — standard
    // CSRF protection for OAuth 2.0 flows.
    const state = randomBytes(16).toString('hex');
    const url = buildAuthorizationUrl(redirectUri, state);
    const response = NextResponse.redirect(url);
    response.cookies.set('oauth_state_google', state, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: 60 * 10, // 10 minutes — more than enough for the consent flow
      path: '/',
    });
    return response;
  } catch (err) {
    return NextResponse.redirect(
      new URL(`/settings?google_error=${encodeURIComponent(err instanceof Error ? err.message : 'unknown')}`, origin),
    );
  }
}
