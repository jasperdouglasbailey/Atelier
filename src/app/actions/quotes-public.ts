'use server';

import { createServiceClient } from '@/lib/supabase/service';
import { getBookingByQuoteToken, transitionState } from '@/lib/data/bookings';
import { getAgencyConfig } from '@/lib/utils/agency-config';
import { checkKillSwitch } from '@/lib/utils/kill-switch';
import { sendEmail } from '@/lib/integrations/gmail';

type QuoteActionResult =
  | { ok: true; state: 'accepted' | 'declined' }
  | { ok: false; error: string };

/**
 * Called from the public /q/[token] page — no auth required.
 * Transitions the booking to quote_confirmed and emails Jasper.
 */
export async function acceptQuoteByTokenAction(token: string): Promise<QuoteActionResult> {
  if (!token) return { ok: false, error: 'Invalid token' };

  const booking = await getBookingByQuoteToken(token);
  if (!booking) return { ok: false, error: 'Quote not found or expired' };
  if (booking.state !== 'quote_sent' && booking.state !== 'artists_crew_held') {
    return { ok: false, error: 'This quote has already been actioned' };
  }

  const targetState = booking.state === 'artists_crew_held' ? 'quote_confirmed' : 'quote_confirmed';
  const result = await transitionState(booking.id, targetState, {});
  if ('error' in result) return { ok: false, error: result.error ?? 'Could not confirm booking' };

  const agency = getAgencyConfig();
  const clientName = booking.client?.company || booking.client?.name || 'Client';
  const { canSendOutbound } = await checkKillSwitch();

  if (canSendOutbound && agency.email) {
    try {
      await sendEmail({
        to: [agency.email],
        subject: `Quote accepted — ${booking.booking_ref}: ${booking.title}`,
        body: `${clientName} has accepted the quote for ${booking.title} (${booking.booking_ref}).\n\nThe booking has been moved to Quote Confirmed. Log in to Atelier to proceed with pre-production.`,
      });
    } catch {
      // Non-fatal — booking is confirmed regardless
    }
  }

  return { ok: true, state: 'accepted' };
}

/**
 * Called from the public /q/[token] page — no auth required.
 * Marks the booking as released (declined quote) and emails Jasper.
 */
export async function declineQuoteByTokenAction(token: string): Promise<QuoteActionResult> {
  if (!token) return { ok: false, error: 'Invalid token' };

  const booking = await getBookingByQuoteToken(token);
  if (!booking) return { ok: false, error: 'Quote not found or expired' };
  if (booking.state !== 'quote_sent' && booking.state !== 'artists_crew_held') {
    return { ok: false, error: 'This quote has already been actioned' };
  }

  const result = await transitionState(booking.id, 'released', {
    reason: 'Client declined quote via self-service link',
  });
  if ('error' in result) return { ok: false, error: result.error ?? 'Could not process' };

  const agency = getAgencyConfig();
  const clientName = booking.client?.company || booking.client?.name || 'Client';
  const { canSendOutbound } = await checkKillSwitch();

  if (canSendOutbound && agency.email) {
    try {
      await sendEmail({
        to: [agency.email],
        subject: `Quote declined — ${booking.booking_ref}: ${booking.title}`,
        body: `${clientName} has declined the quote for ${booking.title} (${booking.booking_ref}).\n\nThe booking has been moved to Released.`,
      });
    } catch {
      // Non-fatal
    }
  }

  return { ok: true, state: 'declined' };
}

// Used by the public page to check current state without auth
export async function getQuoteStateByToken(token: string): Promise<{
  state: string;
  bookingRef: string | null;
  title: string;
} | null> {
  const supabase = createServiceClient();
  const { data } = await supabase
    .from('atelier_bookings')
    .select('state, booking_ref, title')
    .eq('quote_token', token)
    .maybeSingle();

  if (!data) return null;
  return {
    state: data.state as string,
    bookingRef: data.booking_ref as string | null,
    title: data.title as string,
  };
}
