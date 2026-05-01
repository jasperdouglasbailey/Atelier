/**
 * Kick off the Google OAuth flow.
 *
 * Visiting this endpoint redirects to Google's consent screen with the
 * full scope list. After the user approves, Google redirects back to
 * /api/auth/callback/google which surfaces the refresh token.
 *
 * Idempotent — safe to hit multiple times.
 */

import { NextRequest, NextResponse } from 'next/server';
import { buildAuthorizationUrl } from '@/lib/integrations/google-auth';

export async function GET(request: NextRequest) {
  const { origin } = new URL(request.url);
  const redirectUri = process.env.GOOGLE_REDIRECT_URI ?? `${origin}/api/auth/callback/google`;

  try {
    const url = buildAuthorizationUrl(redirectUri);
    return NextResponse.redirect(url);
  } catch (err) {
    return NextResponse.redirect(
      new URL(`/settings?google_error=${encodeURIComponent(err instanceof Error ? err.message : 'unknown')}`, origin),
    );
  }
}
