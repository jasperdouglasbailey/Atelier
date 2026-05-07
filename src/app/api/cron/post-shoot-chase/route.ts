/**
 * Cron: Post-shoot client-chase email drafts.
 *
 * Runs daily at 07:00 AEST (21:00 UTC previous day).
 * For each booking that has reached final_delivery, queues a draft
 * chase email in atelier_approvals at days 7, 14, 22, and 30 after
 * final_delivery_at. Jasper reviews and approves before anything sends.
 *
 * Tone adapts to client.communication_style (formal / casual / terse).
 * null → casual (Jasper's base voice).
 *
 * Idempotency key: `chase_{bookingId}_{dayMark}` — safe to run multiple
 * times per day without creating duplicates (the unique constraint on
 * idempotency_key rejects the insert silently).
 *
 * Protected by CRON_SECRET (same pattern as lock-ot-windows).
 */

import { NextResponse, type NextRequest } from 'next/server';
import { createServiceClient } from '@/lib/supabase/service';
import { getKillSwitchState } from '@/lib/utils/kill-switch';
import { logAudit } from '@/lib/utils/audit';
import { buildPostShootChaseEmail } from '@/lib/utils/comms-tone';
import { isCronAuthorised } from '@/lib/utils/cron-auth';
import type { CommunicationStyle } from '@/lib/types/database';

const CHASE_DAY_MARKS = [7, 14, 22, 30] as const;

function daysSince(ts: string): number {
  return Math.floor((Date.now() - new Date(ts).getTime()) / (1000 * 60 * 60 * 24));
}

export async function GET(req: NextRequest) {
  if (!isCronAuthorised(req, 'POST_SHOOT_CHASE')) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  // Doctrine: kill switch RED defers automation. Don't queue chase drafts
  // when Jasper has paused outbound — they'd just clutter the inbox.
  const ks = await getKillSwitchState();
  if (ks?.is_active) {
    return NextResponse.json({ skipped: 'kill_switch_active' });
  }

  const supabase = createServiceClient();

  // Time-bound: chasing a delivery older than 90 days is never useful.
  const ninetyDaysAgo = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000).toISOString();

  const { data: bookings, error: fetchErr } = await supabase
    .from('atelier_bookings')
    .select(`
      id,
      booking_ref,
      final_delivery_at,
      client:atelier_clients!atelier_bookings_client_id_fkey(name, company, email, communication_style)
    `)
    .not('final_delivery_at', 'is', null)
    .gte('final_delivery_at', ninetyDaysAgo)
    .in('state', ['final_delivery', 'invoice_issued', 'paid'])
    .limit(500);

  if (fetchErr) {
    console.error('[cron/post-shoot-chase] fetch error', fetchErr.message);
    await logAudit({
      userId: null,
      action: 'cron_post_shoot_chase_failed',
      tableName: 'atelier_bookings',
      newValue: { error: fetchErr.message },
    }).catch(() => {});
    return NextResponse.json({ error: fetchErr.message }, { status: 500 });
  }

  let queued = 0;
  const skipped: string[] = [];

  for (const booking of bookings ?? []) {
    if (!booking.final_delivery_at || !booking.booking_ref) continue;

    const days = daysSince(booking.final_delivery_at as string);
    const clientRaw = booking.client as unknown as
      | { name: string; company: string | null; email: string | null; communication_style: CommunicationStyle | null }
      | { name: string; company: string | null; email: string | null; communication_style: CommunicationStyle | null }[]
      | null;
    const clientObj = Array.isArray(clientRaw) ? clientRaw[0] ?? null : clientRaw;
    const clientName = clientObj?.company ?? clientObj?.name ?? 'there';
    const clientEmail = clientObj?.email ?? null;
    const commStyle = clientObj?.communication_style ?? null;

    // Doctrine: never queue a chase that can't be sent.
    if (!clientEmail) {
      console.warn('[cron/post-shoot-chase] skipping — no client email for', booking.booking_ref);
      continue;
    }

    for (const mark of CHASE_DAY_MARKS) {
      if (days < mark) continue; // not time yet

      const key = `chase_${booking.id}_${mark}`;
      const draft = buildPostShootChaseEmail({
        style: commStyle,
        dayMark: mark,
        bookingRef: booking.booking_ref as string,
        clientName,
      });

      const { error: insertErr } = await supabase.from('atelier_approvals').insert({
        agent: 'comms',
        action_type: 'client_chase_email',
        booking_id: booking.id,
        summary: `Day-${mark} post-shoot chase — ${booking.booking_ref}`,
        draft_content: {
          to: [clientEmail],
          subject: draft.subject,
          body: draft.body,
          day_mark: mark,
          booking_ref: booking.booking_ref,
          communication_style: commStyle,
        },
        confidence: 90,
        uncertainty_sources: [],
        idempotency_key: key,
        status: 'pending',
      });

      if (insertErr) {
        // Unique constraint on idempotency_key — already queued, skip silently
        if (insertErr.code !== '23505') {
          console.error('[cron/post-shoot-chase] insert error', key, insertErr.message);
        } else {
          skipped.push(key);
        }
      } else {
        queued++;
        console.log('[cron/post-shoot-chase] queued', key);
      }
    }
  }

  return NextResponse.json({ queued, skipped: skipped.length });
}
