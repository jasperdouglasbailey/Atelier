'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import type { BookingState } from '@/lib/types/database';
import { transitionBookingAction } from '@/app/actions/bookings';
import { BOOKING_STATE_LABELS, STATE_TRANSITIONS, PALETTE } from '@/lib/utils/constants';

type Props = {
  bookingId: string;
  bookingState: BookingState;
};

const NEEDS_MODAL: BookingState[] = ['released', 'cancelled', 'written_off'];

export default function BookingAdvanceButtons({ bookingId, bookingState }: Props) {
  const router = useRouter();
  const [transitioning, setTransitioning] = useState(false);
  const [transitionError, setTransitionError] = useState<string | null>(null);

  const [pendingTransition, setPendingTransition] = useState<BookingState | null>(null);
  const [modalReason, setModalReason] = useState('');
  const [modalReleasedTo, setModalReleasedTo] = useState('');
  const [modalFeeStr, setModalFeeStr] = useState('');

  const allowedTransitions = STATE_TRANSITIONS[bookingState] ?? [];
  if (allowedTransitions.length === 0) return null;

  function openTransition(newState: BookingState) {
    if (NEEDS_MODAL.includes(newState)) {
      setModalReason('');
      setModalReleasedTo('');
      setModalFeeStr('');
      setTransitionError(null);
      setPendingTransition(newState);
    } else {
      runTransition(newState);
    }
  }

  async function runTransition(
    newState: BookingState,
    meta?: { reason?: string; releasedTo?: string; cancellationFee?: number },
  ) {
    setTransitioning(true);
    setTransitionError(null);
    const result = await transitionBookingAction(bookingId, newState, meta);
    if ('error' in result) {
      setTransitionError(result.error ?? 'Unknown error');
    } else {
      setPendingTransition(null);
      router.refresh();
    }
    setTransitioning(false);
  }

  function confirmModal() {
    if (!pendingTransition) return;
    const meta = pendingTransition === 'released'
      ? { reason: modalReason || undefined, releasedTo: modalReleasedTo || undefined }
      : pendingTransition === 'cancelled'
        ? { reason: modalReason || undefined, cancellationFee: modalFeeStr ? Number(modalFeeStr) : undefined }
        : { reason: modalReason || undefined };
    runTransition(pendingTransition, meta);
  }

  return (
    <>
      <div className="flex flex-wrap items-center gap-1.5">
        {allowedTransitions.map((state) => {
          const isExit = state === 'released' || state === 'cancelled' || state === 'written_off';
          const isBack = state === 'quote_drafted' && bookingState === 'quote_sent';
          return (
            <button
              key={state}
              onClick={() => openTransition(state)}
              disabled={transitioning}
              className="rounded-md px-3 py-1.5 text-[11px] font-medium transition-colors disabled:opacity-50"
              style={{
                background: isExit
                  ? 'transparent'
                  : isBack
                    ? 'transparent'
                    : PALETTE.text,
                color: isExit
                  ? PALETTE.danger
                  : isBack
                    ? PALETTE.warning
                    : PALETTE.bg,
                border: isExit
                  ? `1px solid ${PALETTE.danger}44`
                  : isBack
                    ? `1px solid ${PALETTE.warning}44`
                    : 'none',
                cursor: 'pointer',
              }}
            >
              {isBack ? '← ' : '→ '}{BOOKING_STATE_LABELS[state]}
            </button>
          );
        })}
      </div>

      {transitionError && !pendingTransition && (
        <div
          className="mt-2 rounded-md border px-3 py-2 text-xs"
          style={{ borderColor: PALETTE.danger, color: PALETTE.danger }}
        >
          {transitionError}
        </div>
      )}

      {/* Transition modal — released / cancelled / written_off */}
      {pendingTransition && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4"
          style={{ background: 'rgba(0,0,0,0.55)' }}
          onClick={(e) => { if (e.target === e.currentTarget) setPendingTransition(null); }}
        >
          <div
            className="w-full max-w-sm rounded-lg border p-5 space-y-4"
            style={{ background: PALETTE.surface, borderColor: PALETTE.border }}
          >
            <h3 className="text-sm font-semibold" style={{ color: PALETTE.text }}>
              {pendingTransition === 'released' && 'Mark as Released'}
              {pendingTransition === 'cancelled' && 'Cancel Booking'}
              {pendingTransition === 'written_off' && 'Write Off Invoice'}
            </h3>
            <p className="text-[11px]" style={{ color: PALETTE.muted }}>
              {pendingTransition === 'released' && 'The booking was released to another agency. Record the outcome below.'}
              {pendingTransition === 'cancelled' && 'The booking has been cancelled. Record the reason and any applicable fee.'}
              {pendingTransition === 'written_off' && 'The client invoice is unrecoverable. This moves the booking to a closed terminal state.'}
            </p>

            <div className="space-y-3">
              <div>
                <label className="block text-[10px] font-semibold uppercase tracking-wider mb-1" style={{ color: PALETTE.muted }}>
                  {pendingTransition === 'released' ? 'Release reason (optional)' : pendingTransition === 'written_off' ? 'Write-off reason (optional)' : 'Cancellation reason (optional)'}
                </label>
                <input
                  type="text"
                  value={modalReason}
                  onChange={(e) => setModalReason(e.target.value)}
                  onKeyDown={(e) => { if (e.key === 'Enter') confirmModal(); if (e.key === 'Escape') setPendingTransition(null); }}
                  autoFocus
                  placeholder={pendingTransition === 'released' ? 'e.g. Client went direct' : pendingTransition === 'written_off' ? 'e.g. Client in liquidation' : 'e.g. Client pulled budget'}
                  className="w-full rounded border px-3 py-2 text-sm"
                  style={{ background: PALETTE.bg, borderColor: PALETTE.border, color: PALETTE.text, fontFamily: 'inherit', outline: 'none' }}
                />
              </div>

              {pendingTransition === 'released' && (
                <div>
                  <label className="block text-[10px] font-semibold uppercase tracking-wider mb-1" style={{ color: PALETTE.muted }}>
                    Won by (optional)
                  </label>
                  <input
                    type="text"
                    value={modalReleasedTo}
                    onChange={(e) => setModalReleasedTo(e.target.value)}
                    onKeyDown={(e) => { if (e.key === 'Enter') confirmModal(); if (e.key === 'Escape') setPendingTransition(null); }}
                    placeholder="e.g. Viviens, IMG"
                    className="w-full rounded border px-3 py-2 text-sm"
                    style={{ background: PALETTE.bg, borderColor: PALETTE.border, color: PALETTE.text, fontFamily: 'inherit', outline: 'none' }}
                  />
                </div>
              )}

              {pendingTransition === 'cancelled' && (
                <div>
                  <label className="block text-[10px] font-semibold uppercase tracking-wider mb-1" style={{ color: PALETTE.muted }}>
                    Cancellation fee ($, leave blank if none)
                  </label>
                  <input
                    type="number"
                    min="0"
                    step="0.01"
                    value={modalFeeStr}
                    onChange={(e) => setModalFeeStr(e.target.value)}
                    onKeyDown={(e) => { if (e.key === 'Enter') confirmModal(); if (e.key === 'Escape') setPendingTransition(null); }}
                    placeholder="0.00"
                    className="w-full rounded border px-3 py-2 text-sm"
                    style={{ background: PALETTE.bg, borderColor: PALETTE.border, color: PALETTE.text, fontFamily: 'inherit', outline: 'none' }}
                  />
                </div>
              )}
            </div>

            {transitionError && (
              <div className="text-[11px]" style={{ color: PALETTE.danger }}>{transitionError}</div>
            )}

            <div className="flex gap-2 justify-end">
              <button
                type="button"
                onClick={() => setPendingTransition(null)}
                className="rounded px-3 py-1.5 text-xs"
                style={{ background: 'transparent', border: `1px solid ${PALETTE.border}`, color: PALETTE.muted, cursor: 'pointer' }}
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={confirmModal}
                disabled={transitioning}
                className="rounded px-3 py-1.5 text-xs font-medium disabled:opacity-50"
                style={{ background: PALETTE.danger, color: '#fff', border: 'none', cursor: 'pointer' }}
              >
                {transitioning ? 'Saving…' : `Confirm ${BOOKING_STATE_LABELS[pendingTransition]}`}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
