/**
 * Google OAuth — shared auth client for Gmail, Drive, Calendar.
 *
 * Atelier uses ONE Google OAuth grant covering all three services. The user
 * (Jasper) authorises once via /api/auth/callback/google and the resulting
 * refresh token is stored in env (`GOOGLE_REFRESH_TOKEN`). Access tokens are
 * minted on demand and cached in memory until they expire.
 *
 * Scope choice (locked):
 *   gmail.send       — send mail as the agency
 *   gmail.modify     — drafts (compose for approval, send later)
 *   gmail.readonly   — search inbox for client replies / brief threads
 *   drive.file       — files THIS APP creates (NOT all Drive content). Critical
 *                      for verification + Workspace admin trust. Booking folders
 *                      created by the app are visible; the rest of Drive is not.
 *   calendar.events  — create/update events (NOT calendar.readonly which sees
 *                      all calendars). Limited to events the app creates.
 *
 * Token storage: refresh token via env (single-user). When/if Atelier goes
 * multi-user, replace `getRefreshToken()` with a DB lookup keyed by user.
 */

export const GOOGLE_SCOPES = [
  'https://www.googleapis.com/auth/gmail.send',
  'https://www.googleapis.com/auth/gmail.modify',
  'https://www.googleapis.com/auth/gmail.readonly',
  'https://www.googleapis.com/auth/drive.file',
  'https://www.googleapis.com/auth/calendar.events',
] as const;

const TOKEN_URL = 'https://oauth2.googleapis.com/token';
const AUTHORIZE_URL = 'https://accounts.google.com/o/oauth2/v2/auth';

// In-memory access token cache. Cleared on cold start; that's fine.
let cachedAccessToken: { token: string; expiresAt: number } | null = null;

/**
 * Returns true when all required Google credentials are present in env.
 * Used by callers to short-circuit before attempting an API call.
 * Does NOT verify the token is valid — use checkGoogleTokenValid() for that.
 */
export function isGoogleConfigured(): boolean {
  return Boolean(
    process.env.GOOGLE_CLIENT_ID &&
    process.env.GOOGLE_CLIENT_SECRET &&
    process.env.GOOGLE_REFRESH_TOKEN,
  );
}

/**
 * Probes the token endpoint to verify the refresh token is still valid.
 * Returns 'connected' | 'invalid_token' | 'not_configured'.
 * Safe to call on the settings page — lightweight single HTTP request,
 * result cached in memory for subsequent calls.
 */
export async function checkGoogleTokenValid(): Promise<'connected' | 'invalid_token' | 'not_configured'> {
  if (!isGoogleConfigured()) return 'not_configured';
  try {
    await getAccessToken();
    return 'connected';
  } catch {
    return 'invalid_token';
  }
}

/**
 * Build the URL Jasper visits to grant consent. Used once during onboarding.
 * The callback at /api/auth/callback/google exchanges the code for a refresh
 * token, which is then copied into .env as GOOGLE_REFRESH_TOKEN.
 */
export function buildAuthorizationUrl(redirectUri: string, state?: string): string {
  const clientId = process.env.GOOGLE_CLIENT_ID;
  if (!clientId) throw new Error('GOOGLE_CLIENT_ID not set');

  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: redirectUri,
    response_type: 'code',
    scope: GOOGLE_SCOPES.join(' '),
    access_type: 'offline',     // required to get a refresh_token
    prompt: 'consent',          // force consent screen so refresh_token is always returned
    include_granted_scopes: 'true',
    ...(state ? { state } : {}),
  });

  return `${AUTHORIZE_URL}?${params.toString()}`;
}

/**
 * Exchange an authorization code for tokens. Returns the refresh token
 * which the operator pastes into env. The access token is discarded — we
 * mint fresh ones from the refresh token on demand.
 */
export async function exchangeCodeForTokens(code: string, redirectUri: string): Promise<{
  refresh_token?: string;
  access_token: string;
  expires_in: number;
  scope: string;
}> {
  const clientId = process.env.GOOGLE_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
  if (!clientId || !clientSecret) throw new Error('Google OAuth env not set');

  const response = await fetch(TOKEN_URL, {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      code,
      client_id: clientId,
      client_secret: clientSecret,
      redirect_uri: redirectUri,
      grant_type: 'authorization_code',
    }),
  });

  if (!response.ok) {
    const errText = await response.text().catch(() => 'unknown');
    throw new Error(`Google token exchange failed: ${response.status} ${errText}`);
  }

  return response.json() as Promise<{
    refresh_token?: string;
    access_token: string;
    expires_in: number;
    scope: string;
  }>;
}

/**
 * Get a valid access token, refreshing from the stored refresh token if needed.
 * Throws if Google credentials aren't configured — callers should check
 * `isGoogleConfigured()` first if they want graceful degradation.
 */
export async function getAccessToken(): Promise<string> {
  // Return cached token if it has at least 60s remaining
  if (cachedAccessToken && cachedAccessToken.expiresAt > Date.now() + 60_000) {
    return cachedAccessToken.token;
  }

  const clientId = process.env.GOOGLE_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
  const refreshToken = process.env.GOOGLE_REFRESH_TOKEN;

  if (!clientId || !clientSecret || !refreshToken) {
    throw new Error('Google credentials not configured (missing CLIENT_ID, CLIENT_SECRET, or REFRESH_TOKEN)');
  }

  const response = await fetch(TOKEN_URL, {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      refresh_token: refreshToken,
      grant_type: 'refresh_token',
    }),
  });

  if (!response.ok) {
    const errText = await response.text().catch(() => 'unknown');
    throw new Error(`Google token refresh failed: ${response.status} ${errText}`);
  }

  const data = await response.json() as { access_token: string; expires_in: number };
  cachedAccessToken = {
    token: data.access_token,
    expiresAt: Date.now() + data.expires_in * 1000,
  };
  return data.access_token;
}

/**
 * Returns the list of OAuth scopes actually granted on the current token.
 * Calls Google's tokeninfo endpoint using a fresh access token.
 * Returns [] if not configured or on any error.
 */
export async function getGrantedScopes(): Promise<string[]> {
  if (!isGoogleConfigured()) return [];
  try {
    const token = await getAccessToken();
    const res = await fetch(
      `https://oauth2.googleapis.com/tokeninfo?access_token=${encodeURIComponent(token)}`,
    );
    if (!res.ok) return [];
    const data = await res.json() as { scope?: string };
    return data.scope ? data.scope.split(' ') : [];
  } catch {
    return [];
  }
}

/**
 * For tests: clear the in-memory access-token cache.
 */
export function _clearTokenCache(): void {
  cachedAccessToken = null;
}
