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
  // Single OAuth grant covers all three Google services. They light up
  // together when GOOGLE_CLIENT_ID + GOOGLE_CLIENT_SECRET + GOOGLE_REFRESH_TOKEN
  // are all set. Surfaced separately so the operator can see at a glance
  // which integrations are live.
  const googleConfigured = Boolean(
    process.env.GOOGLE_CLIENT_ID &&
    process.env.GOOGLE_CLIENT_SECRET &&
    process.env.GOOGLE_REFRESH_TOKEN,
  );

  return NextResponse.json({
    ok: true,
    ts: new Date().toISOString(),
    env: {
      supabase: Boolean(process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY),
      supabase_service_role: Boolean(process.env.SUPABASE_SERVICE_ROLE_KEY),
      anthropic: Boolean(process.env.ANTHROPIC_API_KEY),
      xero: Boolean(process.env.XERO_CLIENT_ID && process.env.XERO_CLIENT_SECRET),
      gmail: googleConfigured,
      drive: googleConfigured,
      calendar: googleConfigured,
      drive_root_folder_pinned: Boolean(process.env.GOOGLE_DRIVE_ROOT_FOLDER_ID),
      cron_secret: Boolean(process.env.CRON_SECRET),
    },
  });
}
