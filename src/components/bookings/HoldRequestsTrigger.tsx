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
      style={{ background: PALETTE.surface, borderColor: PALETTE.border }}
    >
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h3 className="text-xs font-semibold uppercase tracking-wide" style={{ color: PALETTE.muted }}>
            Crew hold requests
          </h3>
          <p className="mt-1 text-sm" style={{ color: PALETTE.text }}>
            {pendingCrewCount} crew member{pendingCrewCount === 1 ? '' : 's'} on hold-requested status.
          </p>
          {!isQuoteSent && (
            <p className="mt-1 text-[11px]" style={{ color: PALETTE.warning }}>
              Booking is in “{bookingState}”. Drafts will be queued as needs-review (not auto-approvable) until the quote is sent.
            </p>
          )}
        </div>
        <button
          onClick={onClick}
          disabled={isPending}
          className="rounded-md px-3 py-1.5 text-xs font-medium disabled:opacity-50"
          style={{ background: PALETTE.accent, color: PALETTE.bg }}
        >
          {isPending ? 'Generating…' : 'Propose hold-request drafts'}
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
              {result.reason === 'no_pending_holds' && ' · nothing to do (no crew on hold-requested status)'}
              . See <a href="/inbox" className="underline">/inbox</a>.
            </>
          )}
        </div>
      )}
    </section>
  );
}
