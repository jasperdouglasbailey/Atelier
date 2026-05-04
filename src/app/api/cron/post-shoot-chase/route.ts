/**
 * Cron: Post-shoot client-chase email drafts.
 *
 * Runs daily at 07:00 AEST (21:00 UTC previous day).
 * For each booking that has reached final_delivery, queues a draft
 * chase email in atelier_approvals at days 7, 14, 22, and 30 after
 * final_delivery_at. Jasper reviews and approves before anything sends.
 *
 * Idempotency key: `chase_{bookingId}_{dayMark}` — safe to run multiple
 * times per day without creating duplicates (the unique constraint on
 * idempotency_key rejects the insert silently).
 *
 * Protected by CRON_SECRET (same pattern as lock-ot-windows).
 */

import { NextResponse, type NextRequest } from 'next/server';
import { createServiceClient } from '@/lib/supabase/service';

const CHASE_DAY_MARKS = [7, 14, 22, 30] as const;

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
  clientName: string,
): { subject: string; body: string } {
  const subject = `RE: ${bookingRef} — Final deliverables`;

  // Jasper's voice: direct, no "I hope this finds you well", no exclamation marks
  const bodies: Record<number, string> = {
    7: `Hi ${clientName},\n\nFollowing up on the final deliverables for ${bookingRef}. Please let me know if you have any questions or if there's anything you need from our side.\n\nBest,\nJasper`,
    14: `Hi ${clientName},\n\nJust checking in on ${bookingRef} — wanted to make sure the finals landed OK and that you have everything you need.\n\nIf there's anything outstanding, happy to chat.\n\nBest,\nJasper`,
    22: `Hi ${clientName},\n\nFollowing up again on ${bookingRef}. If there are any outstanding retouching notes or delivery questions, let's get them resolved.\n\nBest,\nJasper`,
    30: `Hi ${clientName},\n\nThis is my final follow-up on ${bookingRef}. If you have any outstanding feedback or issues with the deliverables, please reach out directly.\n\nBest,\nJasper`,
  };

  return { subject, body: bodies[dayMark] ?? bodies[30] };
}

export async function GET(req: NextRequest) {
  if (!isAuthorised(req)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const supabase = createServiceClient();

  // Find bookings past final_delivery with a known delivery timestamp
  const { data: bookings, error: fetchErr } = await supabase
    .from('atelier_bookings')
    .select(`
      id,
      booking_ref,
      final_delivery_at,
      client:atelier_clients!atelier_bookings_client_id_fkey(name, company)
    `)
    .not('final_delivery_at', 'is', null)
    .in('state', ['final_delivery', 'invoice_issued', 'paid']);

  if (fetchErr) {
    console.error('[cron/post-shoot-chase] fetch error', fetchErr.message);
    return NextResponse.json({ error: fetchErr.message }, { status: 500 });
  }

  let queued = 0;
  const skipped: string[] = [];

  for (const booking of bookings ?? []) {
    if (!booking.final_delivery_at || !booking.booking_ref) continue;

    const days = daysSince(booking.final_delivery_at as string);
    const clientRaw = booking.client as { name: string; company: string | null } | null;
    const clientName = clientRaw?.company ?? clientRaw?.name ?? 'there';

    for (const mark of CHASE_DAY_MARKS) {
      if (days < mark) continue; // not time yet

      const key = `chase_${booking.id}_${mark}`;
      const draft = chaseEmailDraft(mark, booking.booking_ref as string, clientName);

      const { error: insertErr } = await supabase.from('atelier_approvals').insert({
        agent: 'comms',
        action_type: 'client_chase_email',
        booking_id: booking.id,
        summary: `Day-${mark} post-shoot chase — ${booking.booking_ref}`,
        draft_content: {
          to: [],  // populated from booking.client.email when approved
          subject: draft.subject,
          body: draft.body,
          day_mark: mark,
          booking_ref: booking.booking_ref,
        },
        confidence: 90,
        uncertainty_sources: ['Client email address must be resolved before send'],
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
