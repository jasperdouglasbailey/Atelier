/**
 * Health check endpoint.
 *
 * Two layers of checks:
 *
 * 1. **env** — which integrations have credentials wired up. Cheap, no
 *    outbound calls, safe to hammer.
 *
 * 2. **queries** — runs the small set of critical PostgREST queries the
 *    app's main pages depend on, with `?probe=1`. If any return a Supabase
 *    error, that query is reported as `failed` with the error message.
 *    This is what would have caught the working_name → atelier_talent.name
 *    drift before users hit the broken bookings list. NOT cheap (one
 *    Supabase round-trip per query) — gate behind probe so monitors don't
 *    pound the DB.
 *
 * Status code reflects worst observed: 200 if everything green, 503 if any
 * probed query failed. Uptime monitors should hit `?probe=1` on a slow
 * cadence (every 5–15 min) and the bare endpoint as often as they like.
 */

import { NextResponse, type NextRequest } from 'next/server';
import { runHealthProbes } from '@/lib/utils/health';

export async function GET(req: NextRequest) {
  // Single OAuth grant covers all three Google services. They light up
  // together when GOOGLE_CLIENT_ID + GOOGLE_CLIENT_SECRET + GOOGLE_REFRESH_TOKEN
  // are all set. Surfaced separately so the operator can see at a glance
  // which integrations are live.
  const googleConfigured = Boolean(
    process.env.GOOGLE_CLIENT_ID &&
    process.env.GOOGLE_CLIENT_SECRET &&
    process.env.GOOGLE_REFRESH_TOKEN,
  );

  const env = {
    supabase: Boolean(process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY),
    supabase_service_role: Boolean(process.env.SUPABASE_SERVICE_ROLE_KEY),
    anthropic: Boolean(process.env.ANTHROPIC_API_KEY),
    xero: Boolean(process.env.XERO_CLIENT_ID && process.env.XERO_CLIENT_SECRET),
    gmail: googleConfigured,
    drive: googleConfigured,
    calendar: googleConfigured,
    drive_root_folder_pinned: Boolean(process.env.GOOGLE_DRIVE_ROOT_FOLDER_ID),
    cron_secret: Boolean(process.env.CRON_SECRET),
  };

  const probe = req.nextUrl.searchParams.get('probe');
  if (!probe) {
    // Fast path — no DB hits. Same shape as before for backwards compat.
    return NextResponse.json({ ok: true, ts: new Date().toISOString(), env });
  }

  const queries = await runHealthProbes();
  const allOk = queries.every((q) => q.ok);

  return NextResponse.json(
    { ok: allOk, ts: new Date().toISOString(), env, queries },
    { status: allOk ? 200 : 503 },
  );
}
