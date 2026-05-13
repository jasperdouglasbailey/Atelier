'use client';

/**
 * Booking-lifecycle controls — Archive / Unarchive / Delete.
 *
 *   Archive  → soft-hide from active lists. Reversible.
 *   Delete   → hard-delete the booking row. An anonymised financial
 *              summary is kept in the corpus table for trend analysis.
 *
 * Anonymise is NOT a booking-level operation — it's at the entity
 * (talent / client / crew) level via DataRightsControls.
 *
 * Both destructive actions require explicit two-step confirmation. Delete
 * additionally requires typing the literal word "DELETE" so the operator
 * cannot proceed by muscle memory.
 */

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { archiveBookingAction, unarchiveBookingAction, deleteBookingAction } from '@/app/actions/bookings';
import { PALETTE, TERMINAL_STATES } from '@/lib/utils/constants';
import type { BookingState } from '@/lib/types/database';

type Props = {
  bookingId: string;
  bookingRef: string | null;
  bookingState: string;
  isArchived: boolean;
  /** Compact mode: renders just the Archive button (and Delete when terminal) without the surrounding card. */
  compact?: boolean;
};

export default function BookingLifecycleControls({ bookingId, bookingRef, bookingState, isArchived, compact = false }: Props) {
  const isTerminal = TERMINAL_STATES.includes(bookingState as BookingState);
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const [confirmingArchive, setConfirmingArchive] = useState(false);
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [deleteTyped, setDeleteTyped] = useState('');

  const label = bookingRef ?? bookingId.slice(0, 8);

  function runArchive(target: 'archive' | 'unarchive') {
    setError(null);
    startTransition(async () => {
      const result = target === 'archive'
        ? await archiveBookingAction(bookingId)
        : await unarchiveBookingAction(bookingId);
      if ('error' in result) {
        setError(result.error);
        return;
      }
      setConfirmingArchive(false);
      router.refresh();
    });
  }

  function runDelete() {
    if (deleteTyped.trim().toUpperCase() !== 'DELETE') {
      setError('Type DELETE in capital letters to confirm.');
      return;
    }
    setError(null);
    startTransition(async () => {
      const result = await deleteBookingAction(bookingId);
      if ('error' in result) {
        setError(result.error);
        return;
      }
      router.push('/bookings');
      router.refresh();
    });
  }

  const buttons = (
    <div className="flex flex-wrap gap-2">
        {/* Archive / Unarchive */}
        {confirmingArchive ? (
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-[11px]" style={{ color: PALETTE.warning }}>
              {isArchived ? `Restore ${label}?` : `Archive ${label}?`}
            </span>
            <button
              type="button"
              onClick={() => runArchive(isArchived ? 'unarchive' : 'archive')}
              disabled={pending}
              className="rounded px-2.5 py-1 text-[11px] font-medium disabled:opacity-50"
              style={{ background: PALETTE.warning, color: '#1a1a1a', border: 'none', cursor: 'pointer' }}
            >
              {pending ? '…' : 'Confirm'}
            </button>
            <button
              type="button"
              onClick={() => setConfirmingArchive(false)}
              className="rounded px-2.5 py-1 text-[11px] font-medium"
              style={{ background: 'transparent', color: PALETTE.muted, border: `1px solid ${PALETTE.border}`, cursor: 'pointer' }}
            >
              Cancel
            </button>
          </div>
        ) : (
          <button
            type="button"
            onClick={() => setConfirmingArchive(true)}
            className="rounded px-2.5 py-1 text-[11px] font-medium"
            style={{
              background: 'transparent',
              color: PALETTE.muted,
              border: `1px solid ${PALETTE.border}`,
              cursor: 'pointer',
            }}
          >
            {isArchived ? 'Restore' : 'Archive'}
          </button>
        )}

        {/* Delete — only shown when booking is in a terminal state (paid / released / cancelled / written off).
            In all other states the button is hidden entirely so the action bar stays uncluttered. */}
        {!isTerminal ? null : confirmingDelete ? (
          <div className="flex flex-wrap items-center gap-2">
            <label className="flex flex-col gap-1 text-[11px]" style={{ color: PALETTE.danger }}>
              <span>Permanent delete. Type DELETE to confirm.</span>
              <input
                type="text"
                value={deleteTyped}
                onChange={(e) => setDeleteTyped(e.target.value)}
                placeholder="DELETE"
                className="rounded border px-2 py-1 text-xs"
                style={{
                  background: PALETTE.bg,
                  borderColor: PALETTE.danger,
                  color: PALETTE.text,
                  fontFamily: 'ui-monospace, monospace',
                  letterSpacing: '0.1em',
                }}
                autoFocus
              />
            </label>
            <button
              type="button"
              onClick={runDelete}
              disabled={pending || deleteTyped.trim().toUpperCase() !== 'DELETE'}
              className="rounded px-3 py-1.5 text-xs font-medium disabled:opacity-40"
              style={{ background: PALETTE.danger, color: '#fff', border: 'none', cursor: 'pointer' }}
            >
              {pending ? 'Deleting…' : 'Confirm delete'}
            </button>
            <button
              type="button"
              onClick={() => { setConfirmingDelete(false); setDeleteTyped(''); }}
              className="rounded px-3 py-1.5 text-xs font-medium"
              style={{ background: 'transparent', color: PALETTE.muted, border: `1px solid ${PALETTE.border}`, cursor: 'pointer' }}
            >
              Cancel
            </button>
          </div>
        ) : (
          <button
            type="button"
            onClick={() => setConfirmingDelete(true)}
            className="rounded px-2.5 py-1 text-[11px] font-medium"
            style={{
              background: 'transparent',
              color: PALETTE.danger,
              border: `1px solid ${PALETTE.danger}44`,
              cursor: 'pointer',
            }}
          >
            Delete
          </button>
        )}
      </div>
  );

  if (compact) {
    return (
      <div>
        {buttons}
        {error && (
          <div className="mt-2 text-[11px]" style={{ color: PALETTE.danger }}>{error}</div>
        )}
      </div>
    );
  }

  return (
    <section className="rounded-lg border p-4" style={{ background: PALETTE.surface, borderColor: PALETTE.border }}>
      <h3 className="section-title mb-2">
        Booking lifecycle
      </h3>
      <p className="mb-3 text-[11px]" style={{ color: PALETTE.muted }}>
        Archive hides the booking from active lists but keeps it intact — reversible.
        Delete is permanent: the row is removed and only an anonymised financial
        summary stays in the corpus for trend analysis.
      </p>

      {buttons}

      {error && (
        <div className="mt-2 text-[11px]" style={{ color: PALETTE.danger }}>
          {error}
        </div>
      )}
    </section>
  );
}
