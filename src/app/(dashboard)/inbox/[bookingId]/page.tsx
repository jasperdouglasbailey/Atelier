import { notFound } from 'next/navigation';
import Link from 'next/link';
import Topbar from '@/components/layout/Topbar';
import BriefParser from '@/components/bookings/BriefParser';
import QuoteBuilder from '@/components/quotes/QuoteBuilder';
import SendQuotePanel from '@/components/bookings/SendQuotePanel';
import { getBooking } from '@/lib/data/bookings';
import {
  listQuoteVersions,
  listFeeLinesForBooking,
  listBookingTalent,
  getTalentRatePrecedents,
  type RatePrecedent,
} from '@/lib/data/quotes';
import { isGoogleConfigured } from '@/lib/integrations/google-auth';
import { PALETTE, BOOKING_STATE_LABELS, STATE_COLORS } from '@/lib/utils/constants';

type Props = { params: Promise<{ bookingId: string }> };

/**
 * Brief → Quote → Send focused workspace.
 *
 * A stripped-down single-screen view of a booking that surfaces only the three
 * actions needed to take a new brief to a sent quote:
 *   1. Parse the brief and apply structured fields
 *   2. Review and finalise the quote
 *   3. Send (or draft) the quote email to the client
 *
 * Accessible via the dashboard attention queue or directly as
 * /inbox/[bookingId]. Always links back to the full booking detail.
 */
export default async function InboxBookingPage({ params }: Props) {
  const { bookingId } = await params;
  const booking = await getBooking(bookingId);
  if (!booking) notFound();

  const [quoteVersions, feeLines, bookingTalent] = await Promise.all([
    listQuoteVersions(bookingId),
    listFeeLinesForBooking(bookingId),
    listBookingTalent(bookingId),
  ]);

  const primaryTalentId = bookingTalent[0]?.talent_id ?? null;
  const ratePrecedents: RatePrecedent[] = primaryTalentId
    ? await getTalentRatePrecedents(primaryTalentId, bookingId)
    : [];

  const clientEmail = booking.client?.email ?? null;
  const clientName = booking.client?.company || booking.client?.name || '';

  // Quote is ready to send when at least one fee line exists on the latest version
  const hasQuote = quoteVersions.length > 0 && feeLines.length > 0;
  const canSend = ['quote_drafted', 'quote_sent', 'artists_crew_held'].includes(booking.state);

  // Step completion indicators
  const briefDone = !['brief_received'].includes(booking.state);
  const quoteDone = hasQuote;

  return (
    <>
      <Topbar title="Brief → Quote → Send" />
      <div className="p-4 sm:p-6 max-w-3xl space-y-6">

        {/* Navigation */}
        <div className="flex items-center justify-between">
          <Link href="/inbox" className="text-xs" style={{ color: PALETTE.accent }}>← Inbox</Link>
          <Link
            href={`/bookings/${bookingId}`}
            className="text-xs"
            style={{ color: PALETTE.muted }}
          >
            Full booking detail →
          </Link>
        </div>

        {/* Booking context card */}
        <section
          className="rounded-lg border p-4 flex items-start justify-between gap-4"
          style={{ background: PALETTE.surface, borderColor: PALETTE.border }}
        >
          <div className="space-y-0.5">
            <div className="text-[10px] font-semibold uppercase tracking-wider" style={{ color: PALETTE.muted }}>
              {booking.booking_ref ?? bookingId.slice(0, 8)}
            </div>
            <h2 className="text-base font-semibold" style={{ color: PALETTE.text }}>{booking.title}</h2>
            {clientName && (
              <div className="text-xs" style={{ color: PALETTE.muted }}>{clientName}</div>
            )}
          </div>
          <span
            className="rounded-full px-2.5 py-1 text-[10px] font-semibold shrink-0"
            style={{ background: `${STATE_COLORS[booking.state]}22`, color: STATE_COLORS[booking.state] }}
          >
            {BOOKING_STATE_LABELS[booking.state]}
          </span>
        </section>

        {/* Progress strip */}
        <div className="flex items-center gap-0">
          {[
            { n: 1, label: 'Brief', done: briefDone },
            { n: 2, label: 'Quote', done: quoteDone },
            { n: 3, label: 'Send', done: canSend && booking.state === 'quote_sent' },
          ].map((step, i) => (
            <div key={step.n} className="flex items-center flex-1">
              <div className="flex items-center gap-2 flex-1">
                <div
                  className="flex items-center justify-center rounded-full text-[11px] font-semibold shrink-0"
                  style={{
                    width: 24, height: 24,
                    background: step.done ? PALETTE.success : PALETTE.accent,
                    color: PALETTE.bg,
                    opacity: step.done || i === 0 || (i === 1 && briefDone) || (i === 2 && quoteDone) ? 1 : 0.4,
                  }}
                >
                  {step.done ? '✓' : step.n}
                </div>
                <span
                  className="text-xs font-medium"
                  style={{
                    color: step.done ? PALETTE.success : PALETTE.text,
                    opacity: i === 0 || (i === 1 && briefDone) || (i === 2 && quoteDone) ? 1 : 0.4,
                  }}
                >
                  {step.label}
                </span>
              </div>
              {i < 2 && (
                <div className="h-px flex-1 mx-3" style={{ background: PALETTE.border }} />
              )}
            </div>
          ))}
        </div>

        {/* ── Step 1: Brief ──────────────────────────────────────── */}
        <section className="space-y-3">
          <div className="flex items-center gap-2">
            <div
              className="flex items-center justify-center rounded-full text-[10px] font-bold shrink-0"
              style={{ width: 20, height: 20, background: briefDone ? PALETTE.success : PALETTE.accent, color: PALETTE.bg }}
            >
              {briefDone ? '✓' : '1'}
            </div>
            <h3 className="text-xs font-semibold uppercase tracking-wider" style={{ color: PALETTE.muted }}>
              Brief
            </h3>
          </div>

          {booking.brief_raw_text ? (
            <>
              <details
                className="rounded-lg border"
                style={{ background: PALETTE.surface, borderColor: PALETTE.border }}
              >
                <summary
                  className="cursor-pointer px-4 py-3 text-xs font-medium list-none flex items-center justify-between"
                  style={{ color: PALETTE.muted }}
                >
                  <span>Raw brief text</span>
                  <span style={{ fontSize: 9, opacity: 0.6 }}>click to expand</span>
                </summary>
                <div className="border-t px-4 py-3" style={{ borderColor: PALETTE.border }}>
                  <pre className="whitespace-pre-wrap text-xs leading-relaxed" style={{ color: PALETTE.text, fontFamily: 'inherit' }}>
                    {booking.brief_raw_text}
                  </pre>
                </div>
              </details>
              <BriefParser
                bookingId={bookingId}
                hasBriefText={true}
                currentState={booking.state}
              />
            </>
          ) : (
            <div
              className="rounded-lg border px-4 py-3 text-xs"
              style={{ background: PALETTE.surface, borderColor: PALETTE.border, color: PALETTE.muted }}
            >
              No raw brief text on this booking.{' '}
              <Link href={`/bookings/${bookingId}/edit`} style={{ color: PALETTE.accent }}>
                Add one in Edit
              </Link>{' '}
              to enable the parser.
            </div>
          )}
        </section>

        {/* ── Step 2: Quote ──────────────────────────────────────── */}
        <section className="space-y-3">
          <div className="flex items-center gap-2">
            <div
              className="flex items-center justify-center rounded-full text-[10px] font-bold shrink-0"
              style={{
                width: 20, height: 20,
                background: quoteDone ? PALETTE.success : PALETTE.accent,
                color: PALETTE.bg,
                opacity: briefDone ? 1 : 0.5,
              }}
            >
              {quoteDone ? '✓' : '2'}
            </div>
            <h3 className="text-xs font-semibold uppercase tracking-wider" style={{ color: PALETTE.muted }}>
              Quote
            </h3>
          </div>

          <div
            className="rounded-lg border p-4"
            style={{ background: '#141414', borderColor: '#262626' }}
          >
            <QuoteBuilder
              bookingId={bookingId}
              quoteVersions={quoteVersions}
              feeLines={feeLines}
              bookingTalent={bookingTalent}
              ratePrecedents={ratePrecedents}
            />
          </div>
        </section>

        {/* ── Step 3: Send ───────────────────────────────────────── */}
        <section className="space-y-3">
          <div className="flex items-center gap-2">
            <div
              className="flex items-center justify-center rounded-full text-[10px] font-bold shrink-0"
              style={{
                width: 20, height: 20,
                background: booking.state === 'quote_sent' ? PALETTE.success : PALETTE.accent,
                color: PALETTE.bg,
                opacity: hasQuote ? 1 : 0.5,
              }}
            >
              {booking.state === 'quote_sent' ? '✓' : '3'}
            </div>
            <h3 className="text-xs font-semibold uppercase tracking-wider" style={{ color: PALETTE.muted }}>
              Send Quote
            </h3>
          </div>

          <div
            className="rounded-lg border p-4 space-y-3"
            style={{ background: PALETTE.surface, borderColor: PALETTE.border }}
          >
            {booking.state === 'quote_sent' ? (
              <div className="text-xs" style={{ color: PALETTE.success }}>
                ✓ Quote sent to client. Booking is at <strong>Quote Sent</strong>.
              </div>
            ) : !hasQuote ? (
              <p className="text-xs" style={{ color: PALETTE.muted }}>
                Build and finalise the quote above before sending.
              </p>
            ) : !canSend ? (
              <div className="space-y-2">
                <p className="text-xs" style={{ color: PALETTE.muted }}>
                  Quote is ready. Advance the booking state to <strong>Quote Drafted</strong> to unlock sending.
                </p>
                <Link
                  href={`/bookings/${bookingId}`}
                  className="inline-block rounded px-3 py-1.5 text-xs font-medium"
                  style={{ background: `${PALETTE.accent}18`, color: PALETTE.accent, border: `1px solid ${PALETTE.accent}44` }}
                >
                  Go to booking to update state →
                </Link>
              </div>
            ) : (
              <div className="space-y-2">
                <div className="grid grid-cols-2 gap-2 text-xs">
                  <div>
                    <span className="block text-[10px] font-semibold uppercase tracking-wider mb-0.5" style={{ color: PALETTE.muted }}>To</span>
                    <span style={{ color: clientEmail ? PALETTE.text : PALETTE.warning }}>
                      {clientEmail ?? 'No email on client — add one first'}
                    </span>
                  </div>
                  <div>
                    <span className="block text-[10px] font-semibold uppercase tracking-wider mb-0.5" style={{ color: PALETTE.muted }}>Client</span>
                    <span style={{ color: PALETTE.text }}>{clientName || '—'}</span>
                  </div>
                </div>
                <SendQuotePanel
                  bookingId={bookingId}
                  clientEmail={clientEmail}
                  clientName={clientName}
                  bookingRef={booking.booking_ref}
                  title={booking.title}
                  grandTotal={booking.grand_total ?? 0}
                  currentState={booking.state}
                  googleConfigured={isGoogleConfigured()}
                />
              </div>
            )}
          </div>
        </section>

        {/* Utility links */}
        <div className="flex flex-wrap gap-4 pt-2 text-xs" style={{ color: PALETTE.muted }}>
          <Link href={`/bookings/${bookingId}/edit`} style={{ color: PALETTE.accent }}>Edit booking fields</Link>
          <Link href={`/bookings/${bookingId}`} style={{ color: PALETTE.muted }}>Full detail view</Link>
          <Link href="/inbox" style={{ color: PALETTE.muted }}>← Back to inbox</Link>
        </div>

      </div>
    </>
  );
}
