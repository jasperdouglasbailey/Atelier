'use client';

import { useState, useTransition } from 'react';
import { PALETTE } from '@/lib/utils/constants';
import { getAgencyConfig } from '@/lib/utils/agency-config';
import { formatCurrency } from '@/lib/utils/format';

type Props = {
  bookingRef: string | null;
  title: string;
  shootDateNotes: string | null;
  dayRate: number | null;
  roleOnBooking?: string | null;
  onConfirm: () => Promise<{ ok: true } | { ok: false; error: string }>;
  onDecline: () => Promise<{ ok: true } | { ok: false; error: string }>;
};

export default function HoldCard({
  bookingRef, title, shootDateNotes, dayRate, roleOnBooking, onConfirm, onDecline,
}: Props) {
  const [pending, startTransition] = useTransition();
  const [done, setDone] = useState<'confirmed' | 'declined' | null>(null);
  const [error, setError] = useState<string | null>(null);

  function respond(action: 'confirmed' | 'declined') {
    setError(null);
    startTransition(async () => {
      const result = await (action === 'confirmed' ? onConfirm() : onDecline());
      if (!result.ok) { setError(result.error); return; }
      setDone(action);
    });
  }

  if (done) {
    return (
      <div
        className="rounded-lg border px-4 py-3 text-xs"
        style={{
          borderColor: done === 'confirmed' ? PALETTE.success : PALETTE.muted,
          background: done === 'confirmed' ? `${PALETTE.success}11` : `${PALETTE.muted}11`,
          color: done === 'confirmed' ? PALETTE.success : PALETTE.muted,
        }}
      >
        <span className="font-semibold">{bookingRef ?? title}</span>
        {' — '}
        {done === 'confirmed' ? 'Confirmed. See you on set.' : `Declined. ${getAgencyConfig().name} has been notified.`}
      </div>
    );
  }

  return (
    <div
      className="rounded-lg border p-4 space-y-3"
      style={{ borderColor: PALETTE.warning, background: `${PALETTE.warning}0d` }}
    >
      <div className="flex items-start justify-between gap-2 flex-wrap">
        <div>
          <div className="text-sm font-semibold" style={{ color: PALETTE.text }}>{title}</div>
          {bookingRef && (
            <div className="text-[10px] font-mono mt-0.5" style={{ color: PALETTE.muted }}>{bookingRef}</div>
          )}
        </div>
        <span
          className="rounded-full px-2 py-0.5 text-[10px] font-semibold"
          style={{ background: `${PALETTE.warning}33`, color: PALETTE.warning }}
        >
          Hold requested
        </span>
      </div>

      <div className="grid grid-cols-2 gap-3 text-xs" style={{ color: PALETTE.muted }}>
        {shootDateNotes && <div><span className="uppercase tracking-wide text-[10px]">Date</span><div className="mt-0.5" style={{ color: PALETTE.text }}>{shootDateNotes}</div></div>}
        {dayRate && <div><span className="uppercase tracking-wide text-[10px]">Day rate</span><div className="mt-0.5" style={{ color: PALETTE.text }}>{formatCurrency(dayRate)}</div></div>}
        {roleOnBooking && <div><span className="uppercase tracking-wide text-[10px]">Role</span><div className="mt-0.5" style={{ color: PALETTE.text }}>{roleOnBooking}</div></div>}
      </div>

      {error && (
        <div className="flex items-start justify-between gap-2">
          <p className="text-[11px]" style={{ color: PALETTE.danger }}>{error}</p>
          <button
            type="button"
            onClick={() => setError(null)}
            className="text-[10px] shrink-0"
            style={{ color: PALETTE.muted }}
          >
            Dismiss
          </button>
        </div>
      )}

      <div className="flex gap-2 pt-1">
        <button
          type="button"
          onClick={() => respond('confirmed')}
          disabled={pending}
          className="rounded px-4 py-1.5 text-xs font-medium disabled:opacity-50"
          style={{ background: PALETTE.success, color: '#fff', border: 'none', cursor: 'pointer' }}
        >
          {pending ? 'Saving…' : 'Accept'}
        </button>
        <button
          type="button"
          onClick={() => respond('declined')}
          disabled={pending}
          className="rounded px-4 py-1.5 text-xs font-medium disabled:opacity-50"
          style={{ background: 'transparent', color: PALETTE.danger, border: `1px solid ${PALETTE.danger}66`, cursor: 'pointer' }}
        >
          Decline
        </button>
      </div>
    </div>
  );
}
