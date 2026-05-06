/**
 * Cron: Quote-chase email drafts.
 *
 * Mirror of post-shoot-chase, but for the OTHER end of the booking
 * lifecycle: a quote was sent and the client hasn't replied. The chase
 * cadence is tighter than post-shoot since unanswered quotes need
 * nudging before the client moves on:
 *
 *   Day 3  — gentle "did this land OK?" check-in
 *   Day 7  — "happy to hop on a quick call to discuss"
 *   Day 14 — "is the project still moving forward?"
 *   Day 21 — final follow-up before we step back
 *
 * Runs daily at 21:30 UTC (between post-shoot-chase 21:00 and
 * compliance-pings 22:00). Approval-gated like every other agent
 * comm — Jasper reviews before send.
 *
 * Idempotency: `quote_chase_{bookingId}_{dayMark}` — re-running on
 * the same day doesn't duplicate.
 */

import { NextResponse, type NextRequest } from 'next/server';
import { createServiceClient } from '@/lib/supabase/service';
import { getKillSwitchState } from '@/lib/utils/kill-switch';
import { logAudit } from '@/lib/utils/audit';

const CHASE_DAY_MARKS = [3, 7, 14, 21] as const;

function isAuthorised(req: NextRequest): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;
  const auth = req.headers.get('authorization') ?? '';
  return auth === `Bearer ${secret}`;
}

function daysSince(ts: string): number {
  return Math.floor((Date.now() - new Date(ts).getTime()) / (1000 * 60 * 60 * 24));
}

function chaseEmailDraft(
  dayMark: number,
  bookingRef: string,
  bookingTitle: string,
  clientName: string,
): { subject: string; body: string } {
  const subject = `RE: ${bookingTitle} — ${bookingRef}`;

  // Jasper's voice: direct, concrete next step, no exclamation marks,
  // no "I hope this finds you well", short sentences.
  const bodies: Record<number, string> = {
    3: `Hi ${clientName},

Wanted to check the quote we sent through for ${bookingTitle} landed OK. Happy to walk through any line items or talk pricing if that would help.

What's the timeline looking like on your end?

Best,
Jasper`,
    7: `Hi ${clientName},

Following up on the ${bookingTitle} quote — happy to hop on a quick call this week if it would help unblock anything. Otherwise let me know if there's a tweak that would get this over the line.

Best,
Jasper`,
    14: `Hi ${clientName},

Just checking in on ${bookingTitle}. We've held a few options for crew and dates — let me know if the project is still moving forward or if priorities have shifted.

Best,
Jasper`,
    21: `Hi ${clientName},

This is my last follow-up on ${bookingTitle}. If the timing has slipped or the project is on hold, no problem — just let me know and we'll release the holds. Always happy to revisit when you're ready.

Best,
Jasper`,
  };

  return { subject, body: bodies[dayMark] ?? bodies[21] };
}

export async function GET(req: NextRequest) {
  if (!isAuthorised(req)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  // Doctrine: kill switch RED defers automation.
  const ks = await getKillSwitchState();
  if (ks?.is_active) {
    return NextResponse.json({ skipped: 'kill_switch_active' });
  }

  const supabase = createServiceClient();

  // Bookings stuck in quote_sent for 3+ days. Cap at 30 days back so we
  // don't accidentally chase ancient bookings that should have been
  // released long ago.
  const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
  const threeDaysAgo  = new Date(Date.now() -  3 * 24 * 60 * 60 * 1000).toISOString();

  const { data: bookings, error: fetchErr } = await supabase
    .from('atelier_bookings')
    .select(`
      id,
      booking_ref,
      title,
      quote_sent_at,
      client:atelier_clients!atelier_bookings_client_id_fkey(name, company, email)
    `)
    .eq('state', 'quote_sent')
    .not('quote_sent_at', 'is', null)
    .lte('quote_sent_at', threeDaysAgo)
    .gte('quote_sent_at', thirtyDaysAgo)
    .limit(500);

  if (fetchErr) {
    console.error('[cron/quote-chase] fetch error', fetchErr.message);
    await logAudit({
      userId: null,
      action: 'cron_quote_chase_failed',
      tableName: 'atelier_bookings',
      newValue: { error: fetchErr.message },
    }).catch(() => {});
    return NextResponse.json({ error: fetchErr.message }, { status: 500 });
  }

  let queued = 0;
  const skipped: string[] = [];

  for (const booking of bookings ?? []) {
    if (!booking.quote_sent_at || !booking.booking_ref) continue;

    const days = daysSince(booking.quote_sent_at as string);
    const clientRaw = booking.client as unknown as
      | { name: string; company: string | null; email: string | null }
      | { name: string; company: string | null; email: string | null }[]
      | null;
    const clientObj = Array.isArray(clientRaw) ? clientRaw[0] ?? null : clientRaw;
    const clientName = clientObj?.company ?? clientObj?.name ?? 'there';
    const clientEmail = clientObj?.email ?? null;

    if (!clientEmail) {
      console.warn('[cron/quote-chase] skipping — no client email for', booking.booking_ref);
      continue;
    }

    for (const mark of CHASE_DAY_MARKS) {
      if (days < mark) continue; // not time yet

      const key = `quote_chase_${booking.id}_${mark}`;
      const draft = chaseEmailDraft(
        mark,
        booking.booking_ref as string,
        booking.title as string,
        clientName,
      );

      const { error: insertErr } = await supabase.from('atelier_approvals').insert({
        agent: 'comms',
        action_type: 'client_quote_chase_email',
        booking_id: booking.id,
        summary: `Day-${mark} quote chase — ${booking.booking_ref}`,
        draft_content: {
          to: [clientEmail],
          subject: draft.subject,
          body: draft.body,
          day_mark: mark,
          booking_ref: booking.booking_ref,
          booking_title: booking.title,
        },
        confidence: 90,
        uncertainty_sources: mark >= 21
          ? ['Day-21 is the last automated nudge — consider phoning if this client has gone quiet']
          : [],
        idempotency_key: key,
        status: 'pending',
      });

      if (insertErr) {
        if (insertErr.code === '23505') {
          skipped.push(key);
        } else {
          console.error('[cron/quote-chase] insert error', key, insertErr.message);
        }
      } else {
        queued++;
        console.log('[cron/quote-chase] queued', key);
      }
    }
  }

  return NextResponse.json({ queued, skipped: skipped.length });
}
