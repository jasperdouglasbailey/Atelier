'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { proposeHoldRequestsAction } from '@/app/actions/hold-requests';
import { PALETTE } from '@/lib/utils/constants';

type Props = { bookingId: string; pendingCrewCount: number; bookingState: string };

export default function HoldRequestsTrigger({ bookingId, pendingCrewCount, bookingState }: Props) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [result, setResult] = useState<{ created?: number; skipped?: number; error?: string; reason?: string } | null>(null);

  // Only surface this panel when there's something actionable:
  // crew sitting in hold_requested status waiting for an approval draft.
  if (pendingCrewCount === 0) return null;

  const onClick = () => {
    setResult(null);
    startTransition(async () => {
      const r = await proposeHoldRequestsAction(bookingId);
      setResult(r);
      router.refresh();
    });
  };

  const isQuoteSent = bookingState === 'quote_sent';

  return (
    <section
      className="rounded-lg border p-4"
      style={{ background: PALETTE.surface, borderColor: `${PALETTE.warning}55` }}
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 className="text-xs font-semibold uppercase tracking-wide" style={{ color: PALETTE.warning }}>
            Crew awaiting hold-request drafts
          </h3>
          <p className="mt-1 text-sm" style={{ color: PALETTE.text }}>
            {pendingCrewCount} crew member{pendingCrewCount === 1 ? '' : 's'}{' '}
            on <span style={{ color: PALETTE.warning }}>hold-requested</span> status
            — no approval draft in inbox yet.
          </p>
          <p className="mt-1 text-[11px]" style={{ color: PALETTE.muted }}>
            {isQuoteSent
              ? 'Drafts should have auto-queued when the quote was sent. Re-run if they\'re missing.'
              : `Booking is at "${bookingState}" — advance to Quote Sent to trigger automatically, or re-run here manually.`}
          </p>
        </div>
        <button
          onClick={onClick}
          disabled={isPending}
          className="rounded-md px-3 py-1.5 text-xs font-medium disabled:opacity-50 whitespace-nowrap"
          style={{ background: `${PALETTE.warning}22`, color: PALETTE.warning, border: `1px solid ${PALETTE.warning}44` }}
        >
          {isPending ? 'Queuing…' : 'Re-run hold-request drafts'}
        </button>
      </div>

      {result && (
        <div
          className="mt-3 rounded-md border px-3 py-2 text-xs"
          style={{
            borderColor: result.error ? PALETTE.danger : PALETTE.success,
            color: result.error ? PALETTE.danger : PALETTE.success,
            background: result.error ? `${PALETTE.danger}11` : `${PALETTE.success}11`,
          }}
        >
          {result.error ? (
            result.error
          ) : (
            <>
              {result.created ?? 0} new draft{(result.created ?? 0) === 1 ? '' : 's'} queued
              {result.skipped ? ` · ${result.skipped} already in inbox` : ''}
              {result.reason === 'no_pending_holds' && ' · nothing to do'}
              .{' '}
              <a href="/inbox" className="underline">
                View in inbox →
              </a>
            </>
          )}
        </div>
      )}
    </section>
  );
}
