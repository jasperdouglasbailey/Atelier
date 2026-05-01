/**
 * Health check endpoint.
 *
 * Returns 200 with a small JSON payload reporting which integrations are
 * configured (env vars present). Suitable for uptime monitors and CI
 * smoke tests. Does NOT make any outbound calls — safe to hammer.
 *
 * Note: this only checks env presence, not that the credentials work.
 * For end-to-end verification, hit the integration-specific test routes
 * (TBD when integrations are real).
 */

import { NextResponse } from 'next/server';

export async function GET() {
  return NextResponse.json({
    ok: true,
    ts: new Date().toISOString(),
    env: {
      supabase: Boolean(process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY),
      anthropic: Boolean(process.env.ANTHROPIC_API_KEY),
      xero: Boolean(process.env.XERO_CLIENT_ID && process.env.XERO_CLIENT_SECRET),
      google: Boolean(
        process.env.GOOGLE_CLIENT_ID &&
        process.env.GOOGLE_CLIENT_SECRET &&
        process.env.GOOGLE_REFRESH_TOKEN,
      ),
    },
  });
}
