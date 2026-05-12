/**
 * Cron: Talent gallery-share reminder.
 *
 * After a booking reaches final_delivery, each confirmed talent gets an
 * approval-gated email asking them to share their selects / gallery link
 * with the agency. Fires 1 day after final_delivery_at.
 *
 * Why: Jasper needs talent images to finalise client delivery, write
 * corpus precedents, and update portfolio. Without a nudge, gallery
 * sharing stalls — the talent assumes someone else will follow up.
 *
 * Runs daily at 21:45 UTC (slots: lock-ot 16:00, post-shoot 21:00,
 * quote-chase 21:30, talent-gallery 21:45, compliance-pings 22:00).
 * Approval-gated — Jasper reviews before anything sends.
 *
 * Idempotency: `talent_gallery_${bookingId}_${talentId}` — one per
 * talent per booking. Won't re-queue if the booking shoot dates shift.
 *
 * Protected by CRON_SECRET.
 */

import { NextResponse, type NextRequest } from 'next/server';
import { createServiceClient } from '@/lib/supabase/service';
import { getKillSwitchState } from '@/lib/utils/kill-switch';
import { logAudit } from '@/lib/utils/audit';
import { isCronAuthorised } from '@/lib/utils/cron-auth';

function daysSince(ts: string): number {
  return Math.floor((Date.now() - new Date(ts).getTime()) / (1000 * 60 * 60 * 24));
}

function buildGalleryPingEmail(opts: {
  talentName: string;
  bookingRef: string;
  bookingTitle: string;
}): { subject: string; body: string } {
  const { talentName, bookingRef, bookingTitle } = opts;

  // Friendly, short. We're asking talent for a favour.
  // Not terse (they deserve warmth after the shoot) but not verbose either.
  const subject = `${bookingRef} — can you share your gallery?`;
  const body = `Hi ${talentName},

Hope the ${bookingTitle} shoot went well.

When you get a chance, can you share your selects or gallery link with us? It helps us wrap up delivery and keep the booking file complete.

Thanks,
Jasper
Saunders & Co`;

  return { subject, body };
}

export async function GET(req: NextRequest) {
  if (!isCronAuthorised(req, 'TALENT_GALLERY_PING')) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  // Doctrine: kill switch RED defers automation.
  const ks = await getKillSwitchState();
  if (ks?.is_active) {
    return NextResponse.json({ skipped: 'kill_switch_active' });
  }

  const supabase = createServiceClient();

  // Bookings that reached final_delivery in the last 30 days.
  // 1 day min — give the client delivery some breathing room before
  // chasing talent. 30 days max — if no one followed up in a month, skip.
  const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
  const oneDayAgo     = new Date(Date.now() -  1 * 24 * 60 * 60 * 1000).toISOString();

  const { data: bookings, error: fetchErr } = await supabase
    .from('atelier_bookings')
    .select(`
      id,
      booking_ref,
      title,
      final_delivery_at,
      booking_talent:atelier_booking_talent(
        id,
        talent_id,
        confirmed,
        talent:atelier_talent!atelier_booking_talent_talent_id_fkey(
          id,
          working_name,
          email
        )
      ),
      booking_crew:atelier_booking_crew(
        id,
        crew_id,
        confirmed,
        role_on_booking,
        crew:atelier_crew!atelier_booking_crew_crew_id_fkey(
          id,
          name,
          email,
          primary_role
        )
      )
    `)
    .not('final_delivery_at', 'is', null)
    .lte('final_delivery_at', oneDayAgo)
    .gte('final_delivery_at', thirtyDaysAgo)
    .in('state', ['final_delivery', 'invoice_issued', 'paid'])
    .limit(200);

  if (fetchErr) {
    console.error('[cron/talent-gallery-ping] fetch error', fetchErr.message);
    await logAudit({
      userId: null,
      action: 'cron_talent_gallery_ping_failed',
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
    if (days < 1) continue; // redundant but defensive

    // Iterate over confirmed talent on this booking.
    // PostgREST infers the join as array — normalise the talent field.
    const talentRows = (booking.booking_talent ?? []) as unknown as Array<{
      id: string;
      talent_id: string;
      confirmed: boolean;
      talent: { id: string; working_name: string; email: string | null }
             | { id: string; working_name: string; email: string | null }[]
             | null;
    }>;

    for (const bt of talentRows) {
      if (!bt.confirmed) continue; // only ping talent who actually shot

      // Normalise talent join (PostgREST may return array or object)
      const talentRaw = bt.talent;
      const talent = Array.isArray(talentRaw) ? talentRaw[0] ?? null : talentRaw;

      if (!talent?.email) {
        console.warn('[cron/talent-gallery-ping] no email for talent', bt.talent_id, 'on', booking.booking_ref);
        continue;
      }

      const key = `talent_gallery_${booking.id}_${bt.talent_id}`;
      const draft = buildGalleryPingEmail({
        talentName: talent.working_name,
        bookingRef: booking.booking_ref as string,
        bookingTitle: booking.title as string,
      });

      const { error: insertErr } = await supabase.from('atelier_approvals').insert({
        agent: 'comms',
        action_type: 'talent_gallery_share_request',
        booking_id: booking.id,
        summary: `Gallery-share request — ${talent.working_name} / ${booking.booking_ref}`,
        draft_content: {
          to: [talent.email],
          subject: draft.subject,
          body: draft.body,
          talent_id: bt.talent_id,
          talent_name: talent.working_name,
          booking_ref: booking.booking_ref,
          booking_title: booking.title,
          days_since_delivery: days,
        },
        confidence: 95,
        uncertainty_sources: [],
        idempotency_key: key,
        status: 'pending',
      });

      if (insertErr) {
        if (insertErr.code === '23505') {
          skipped.push(key);
        } else {
          console.error('[cron/talent-gallery-ping] insert error', key, insertErr.message);
        }
      } else {
        queued++;
        console.log('[cron/talent-gallery-ping] queued', key);
      }
    }

    // Also ping confirmed crew who handle digital/editing work (they often
    // hold the raw selects and need to upload or share them).
    const GALLERY_CREW_ROLES = ['digital_operator', 'photo_editor', 'video_editor', 'retoucher', 'digi_tech'];
    const crewRows = (booking.booking_crew ?? []) as unknown as Array<{
      id: string;
      crew_id: string;
      confirmed: boolean;
      role_on_booking: string | null;
      crew: { id: string; name: string; email: string | null; primary_role: string | null }
           | { id: string; name: string; email: string | null; primary_role: string | null }[]
           | null;
    }>;

    for (const bc of crewRows) {
      if (!bc.confirmed) continue;
      const crewRaw = bc.crew;
      const crew = Array.isArray(crewRaw) ? crewRaw[0] ?? null : crewRaw;
      if (!crew?.email) continue;

      const role = bc.role_on_booking ?? crew.primary_role ?? '';
      if (!GALLERY_CREW_ROLES.some((r) => role.toLowerCase().includes(r.replace('_', ' ').toLowerCase()))) continue;

      const key = `crew_gallery_${booking.id}_${bc.crew_id}`;
      const draft = buildGalleryPingEmail({
        talentName: crew.name,
        bookingRef: booking.booking_ref as string,
        bookingTitle: booking.title as string,
      });

      const { error: insertErr } = await supabase.from('atelier_approvals').insert({
        agent: 'comms',
        action_type: 'crew_gallery_share_request',
        booking_id: booking.id,
        summary: `Gallery-share request (crew) — ${crew.name} / ${booking.booking_ref}`,
        draft_content: {
          to: [crew.email],
          subject: draft.subject,
          body: draft.body,
          crew_id: bc.crew_id,
          crew_name: crew.name,
          booking_ref: booking.booking_ref,
          booking_title: booking.title,
          days_since_delivery: days,
        },
        confidence: 95,
        uncertainty_sources: [],
        idempotency_key: key,
        status: 'pending',
      });

      if (insertErr) {
        if (insertErr.code === '23505') { skipped.push(key); }
        else { console.error('[cron/talent-gallery-ping] crew insert error', key, insertErr.message); }
      } else {
        queued++;
      }
    }
  }

  return NextResponse.json({ queued, skipped: skipped.length });
}
