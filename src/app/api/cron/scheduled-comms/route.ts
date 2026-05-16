/**
 * Unified scheduled-comms cron.
 *
 * Replaces the four pre-2026-05 reminder routes (`quote-chase`,
 * `post-shoot-chase`, `talent-gallery-ping`, `compliance-pings`). Each
 * was ~150 LOC of identical boilerplate around a different match query.
 *
 * Now: this one route iterates `REMINDER_RULES` from
 * `src/lib/automation/reminder-rules.ts`, runs each rule's match
 * function, and queues approval rows. One auth secret, one kill-switch
 * gate, one audit pattern.
 *
 * Schedule: daily at 21:30 UTC (= 07:30 AEST / 08:30 AEDT). The old
 * routes were staggered 21:00 / 21:30 / 21:45 / 22:00 to spread the
 * Vercel function load; one route doesn't need that.
 *
 * Per-rule failure isolation: if `rule.match()` throws, the error is
 * caught, logged, recorded in the audit, and the next rule still runs.
 * One bad rule shouldn't black out the rest of the reminder pipeline.
 *
 * Idempotency keys stay the same as the old crons so the cut-over is
 * a no-op for already-queued drafts.
 */

import { NextResponse, type NextRequest } from 'next/server';
import { createServiceClient } from '@/lib/supabase/service';
import { getKillSwitchState } from '@/lib/utils/kill-switch';
import { logAudit, logAuditFailure } from '@/lib/utils/audit';
import { isCronAuthorised } from '@/lib/utils/cron-auth';
import { REMINDER_RULES } from '@/lib/automation/reminder-rules';

export async function GET(req: NextRequest) {
  if (!isCronAuthorised(req, 'SCHEDULED_COMMS')) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  // Doctrine: kill switch RED defers automation.
  const ks = await getKillSwitchState();
  if (ks?.is_active) {
    return NextResponse.json({ skipped: 'kill_switch_active' });
  }

  await logAudit({
    userId: null,
    action: 'cron_scheduled_comms_run',
    tableName: 'atelier_audit_log',
    newValue: { startedAt: new Date().toISOString() },
  }).catch(() => { /* non-fatal */ });

  const supabase = createServiceClient();
  const perRule: Record<string, { queued: number; skipped: number; errors: number }> = {};
  let totalQueued = 0;
  let totalSkipped = 0;

  for (const rule of REMINDER_RULES) {
    let queued = 0;
    let skipped = 0;
    let errors = 0;

    try {
      const matches = await rule.match(supabase);

      for (const m of matches) {
        const { error } = await supabase.from('atelier_approvals').insert({
          agent: 'comms',
          action_type: m.actionType,
          booking_id: m.bookingId,
          summary: m.summary,
          draft_content: m.draftContent,
          confidence: m.confidence ?? 90,
          uncertainty_sources: m.uncertaintySources ?? [],
          idempotency_key: m.idempotencyKey,
          status: 'pending',
        });

        if (error) {
          // 23505 = unique violation on idempotency_key — silent skip
          if (error.code === '23505') {
            skipped++;
          } else {
            errors++;
            console.error(`[cron/scheduled-comms] ${rule.id} insert error`, m.idempotencyKey, error.message);
          }
          continue;
        }

        queued++;
        if (m.onQueued) {
          try { await m.onQueued(); }
          catch (err) { console.error(`[cron/scheduled-comms] ${rule.id} onQueued failed`, err); /* non-fatal */ }
        }
      }
    } catch (err) {
      errors++;
      const msg = err instanceof Error ? err.message : String(err);
      console.error(`[cron/scheduled-comms] rule ${rule.id} threw`, msg);
      await logAuditFailure({
        userId: null,
        action: `cron_scheduled_comms_${rule.id}`,
        tableName: 'atelier_audit_log',
        error: msg,
      }).catch(() => { /* non-fatal */ });
    }

    perRule[rule.id] = { queued, skipped, errors };
    totalQueued += queued;
    totalSkipped += skipped;
  }

  await logAudit({
    userId: null,
    action: 'cron_scheduled_comms_complete',
    tableName: 'atelier_audit_log',
    newValue: { queued: totalQueued, skipped: totalSkipped, perRule } as never,
  }).catch(() => { /* non-fatal */ });

  return NextResponse.json({ queued: totalQueued, skipped: totalSkipped, perRule });
}
