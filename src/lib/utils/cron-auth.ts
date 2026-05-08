/**
 * Shared cron authorisation helper.
 *
 * Every cron endpoint accepts an Authorization: Bearer header containing
 * either:
 *   - a per-cron secret  (CRON_SECRET_<NAME>, preferred — limits blast
 *     radius if any one secret leaks)
 *   - the shared CRON_SECRET  (fallback — keeps existing crons working
 *     while the per-cron rollout is in progress)
 *
 * Vercel cron schedules send `Authorization: Bearer ${CRON_SECRET}` by
 * default. To use per-cron secrets, set CRON_SECRET_<NAME> in Vercel env
 * and configure a custom Authorization header on the cron in vercel.json
 * (Vercel supports this on Pro+).
 *
 * Returns true on a successful match. Constant-time compare via
 * Buffer.compare against equal-length strings — minor mitigation against
 * timing oracles, though Vercel cron auth is not a high-value target.
 */

import type { NextRequest } from 'next/server';

export type CronName =
  | 'LOCK_OT_WINDOWS'
  | 'POST_SHOOT_CHASE'
  | 'QUOTE_CHASE'
  | 'TALENT_GALLERY_PING'
  | 'COMPLIANCE_PINGS'
  | 'DATA_RETENTION'
  | 'AUTO_ANONYMISE'
  | 'TOMORROW_DIGEST';

function constantTimeEquals(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) {
    diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return diff === 0;
}

export function isCronAuthorised(req: NextRequest, name: CronName): boolean {
  const auth = req.headers.get('authorization') ?? '';
  if (!auth.startsWith('Bearer ')) return false;
  const presented = auth.slice('Bearer '.length);

  const perCron = process.env[`CRON_SECRET_${name}`];
  const shared = process.env.CRON_SECRET;

  if (perCron && constantTimeEquals(presented, perCron)) return true;
  if (shared && constantTimeEquals(presented, shared)) return true;
  return false;
}
