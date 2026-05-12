'use client';

import { useState, useEffect, useTransition, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { updateBookingShootDatesAction } from '@/app/actions/bookings';
import { PALETTE } from '@/lib/utils/constants';
import { dateRangeToInputs } from '@/lib/utils/daterange';
import { formatShootDates } from '@/lib/utils/format';

type Props = {
  bookingId: string;
  label: string;
  shootDates: string | null;
  shootDateNotes?: string | null;
  cols?: 1 | 2;
};

/**
 * Two-input inline editor for the shoot date range. Saves both `start` and
 * `end` in a single server action call so the Postgres `daterange` column
 * stays consistent. End is exclusive on the wire (Postgres convention) but
 * the inputs show the inclusive last-day for sanity — the action's helper
 * handles the conversion.
 */
export default function InlineDateRange({ bookingId, label, shootDates, shootDateNotes, cols = 1 }: Props) {
  const router = useRouter();
  const initial = dateRangeToInputs(shootDates);
  const [editing, setEditing] = useState(false);
  const [start, setStart] = useState(initial.start ?? '');
  const [end, setEnd] = useState(initial.end ?? '');
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const firstRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    const fresh = dateRangeToInputs(shootDates);
    setStart(fresh.start ?? '');
    setEnd(fresh.end ?? '');
  }, [shootDates]);

  useEffect(() => {
    if (editing) firstRef.current?.focus();
  }, [editing]);

  function commit() {
    const initialStart = initial.start ?? '';
    const initialEnd = initial.end ?? '';
    if (start === initialStart && end === initialEnd) {
      setEditing(false);
      return;
    }
    setError(null);
    startTransition(async () => {
      const result = await updateBookingShootDatesAction(
        bookingId,
        start || null,
        end || null,
      );
      if ('error' in result && result.error) {
        setError(result.error);
        return;
      }
      setEditing(false);
      router.refresh();
    });
  }

  function cancel() {
    setStart(initial.start ?? '');
    setEnd(initial.end ?? '');
    setError(null);
    setEditing(false);
  }

  function handleKey(e: React.KeyboardEvent) {
    if (e.key === 'Escape') {
      e.preventDefault();
      cancel();
    } else if (e.key === 'Enter') {
      e.preventDefault();
      commit();
    }
  }

  if (!editing) {
    const display = formatShootDates(shootDates) ?? shootDateNotes ?? null;
    return (
      <button
        type="button"
        onClick={() => setEditing(true)}
        className={`group relative w-full text-left rounded-md transition ${cols === 2 ? 'col-span-2' : ''}`}
        style={{
          padding: '8px 28px 8px 10px',
          border: '1px solid transparent',
          background: 'transparent',
          cursor: 'text',
        }}
        onMouseEnter={(e) => {
          e.currentTarget.style.background = 'rgba(108,138,255,0.05)';
          e.currentTarget.style.borderColor = PALETTE.border;
        }}
        onMouseLeave={(e) => {
          e.currentTarget.style.background = 'transparent';
          e.currentTarget.style.borderColor = 'transparent';
        }}
      >
        <div className="text-[10px] font-semibold uppercase tracking-wider" style={{ color: PALETTE.muted }}>
          {label}
        </div>
        <div className="mt-0.5 text-sm" style={{ color: display ? PALETTE.text : PALETTE.muted }}>
          {display ?? '—'}
        </div>
        <span
          className="absolute right-2 top-1/2 -translate-y-1/2 opacity-0 group-hover:opacity-60 transition text-[11px]"
          style={{ color: PALETTE.muted }}
        >
          ✎
        </span>
      </button>
    );
  }

  const inputStyle: React.CSSProperties = {
    background: PALETTE.bg,
    color: PALETTE.text,
    border: `1px solid ${PALETTE.accent}`,
    borderRadius: 4,
    padding: '5px 8px',
    fontSize: 13,
    fontFamily: 'inherit',
    flex: 1,
    minWidth: 0,
    outline: 'none',
  };

  return (
    <div
      className={`relative rounded-md ${cols === 2 ? 'col-span-2' : ''}`}
      style={{ padding: '8px 10px', background: 'rgba(108,138,255,0.06)', border: `1px solid ${PALETTE.accent}` }}
    >
      <div className="text-[10px] font-semibold uppercase tracking-wider mb-1" style={{ color: PALETTE.muted }}>
        {label}
      </div>
      <div className="flex items-center gap-2">
        <input
          ref={firstRef}
          type="date"
          value={start}
          onChange={(e) => setStart(e.target.value)}
          onKeyDown={handleKey}
          style={inputStyle}
          disabled={pending}
        />
        <span style={{ color: PALETTE.muted, fontSize: 12 }}>→</span>
        <input
          type="date"
          value={end}
          onChange={(e) => setEnd(e.target.value)}
          onBlur={commit}
          onKeyDown={handleKey}
          style={inputStyle}
          disabled={pending}
        />
      </div>
      <div className="mt-1 text-[10px]" style={{ color: error ? PALETTE.danger : PALETTE.muted }}>
        {error ? error : pending ? 'Saving…' : (
          <>
            <kbd style={{ background: PALETTE.surface, border: `1px solid ${PALETTE.border}`, borderRadius: 3, padding: '0px 4px', fontSize: 9 }}>↵</kbd> save · <kbd style={{ background: PALETTE.surface, border: `1px solid ${PALETTE.border}`, borderRadius: 3, padding: '0px 4px', fontSize: 9 }}>esc</kbd> cancel
          </>
        )}
      </div>
    </div>
  );
}
