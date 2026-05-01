/**
 * Google OAuth callback.
 *
 * Flow:
 *   1. Operator visits /settings (or hits the /api/auth/start/google route TBD)
 *      which redirects to Google's authorize endpoint with our scopes
 *   2. Google redirects back here with `?code=...`
 *   3. We exchange the code for an access token + refresh token
 *   4. We surface the refresh token to the operator so they can paste it
 *      into GOOGLE_REFRESH_TOKEN in their env. This is a one-time setup
 *      step — once the env is set, the app refreshes access tokens on demand.
 *
 * Why surface the refresh token rather than store it in DB? Two reasons:
 *   - Single-user app today; env is simpler than a tokens table
 *   - Forces explicit operator action — accidental token rotation requires
 *     the operator to actually update env, no silent breakage
 *
 * When Atelier becomes multi-user, replace this with a per-user DB row in a
 * (TBD) `atelier_oauth_tokens` table keyed by user id + provider.
 */

import { NextRequest, NextResponse } from 'next/server';
import { exchangeCodeForTokens } from '@/lib/integrations/google-auth';

export async function GET(request: NextRequest) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get('code');
  const error = searchParams.get('error');

  if (error) {
    return NextResponse.redirect(new URL(`/settings?google_error=${encodeURIComponent(error)}`, origin));
  }

  if (!code) {
    return NextResponse.redirect(new URL('/settings?google_error=missing_code', origin));
  }

  // Use the configured redirect URI if set, otherwise reconstruct from request.
  // Google requires the redirect_uri sent here to EXACTLY match what was used
  // during authorize, so prefer the env value when available.
  const redirectUri = process.env.GOOGLE_REDIRECT_URI ?? `${origin}/api/auth/callback/google`;

  try {
    const tokens = await exchangeCodeForTokens(code, redirectUri);

    // The refresh_token is only returned the FIRST time a user grants consent
    // (or when prompt=consent forces re-consent). If it's missing, the operator
    // needs to revoke the existing grant at https://myaccount.google.com/permissions
    // and try again.
    if (!tokens.refresh_token) {
      return NextResponse.redirect(
        new URL('/settings?google_error=no_refresh_token', origin),
      );
    }

    // Surface the refresh token to the operator. Plain HTML response —
    // not stored in cookies/session because this is a one-time setup
    // step and the operator needs to copy the value into env manually.
    const html = `<!doctype html>
<html>
<head>
  <title>Google OAuth — Atelier</title>
  <meta name="robots" content="noindex">
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; max-width: 720px; margin: 40px auto; padding: 24px; background: #0a0a0a; color: #e8e9ee; }
    h1 { font-size: 18px; }
    code { display: block; padding: 16px; background: #141414; border: 1px solid #262626; border-radius: 6px; word-break: break-all; user-select: all; font-size: 12px; }
    .label { font-size: 11px; text-transform: uppercase; letter-spacing: 0.06em; color: #7a8294; margin-top: 24px; margin-bottom: 6px; }
    .ok { color: #4ade80; }
    a { color: #60a5fa; }
  </style>
</head>
<body>
  <h1 class="ok">✓ Google OAuth completed</h1>
  <p>Add the following line to your <code style="display:inline;padding:2px 6px;">.env.local</code> (or your deploy environment) and restart the app:</p>
  <div class="label">GOOGLE_REFRESH_TOKEN</div>
  <code>GOOGLE_REFRESH_TOKEN=${escapeHtml(tokens.refresh_token)}</code>
  <div class="label">Granted scopes</div>
  <code>${escapeHtml(tokens.scope)}</code>
  <p style="margin-top:32px;font-size:12px;color:#7a8294;">
    Once the env is set, the app will mint fresh access tokens on demand.
    You can close this tab. Return to <a href="/settings">Settings</a>.
  </p>
</body>
</html>`;

    return new NextResponse(html, {
      status: 200,
      headers: { 'content-type': 'text/html; charset=utf-8' },
    });
  } catch (err) {
    console.error('[google-oauth] exchange failed', err);
    return NextResponse.redirect(
      new URL(`/settings?google_error=${encodeURIComponent(err instanceof Error ? err.message : 'unknown')}`, origin),
    );
  }
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}
