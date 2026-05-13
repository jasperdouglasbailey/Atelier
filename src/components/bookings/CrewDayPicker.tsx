'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { updateBookingCrewAssignedDatesAction } from '@/app/actions/quotes';
import { PALETTE } from '@/lib/utils/constants';
import { formatDate } from '@/lib/utils/format';

type Props = {
  bookingCrewId: string;
  bookingId: string;
  /** All shoot days for the booking, ISO YYYY-MM-DD. */
  shootDays: string[];
  /** Currently assigned days. NULL/empty in DB = assigned to all days. */
  assignedDates: string[] | null;
};

export default function CrewDayPicker({ bookingCrewId, bookingId, shootDays, assignedDates }: Props) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const initial = new Set<string>(
    (assignedDates && assignedDates.length > 0) ? assignedDates : shootDays,
  );
  const [selected, setSelected] = useState<Set<string>>(initial);

  function toggle(day: string) {
    const next = new Set(selected);
    if (next.has(day)) next.delete(day);
    else next.add(day);
    setSelected(next);

    // Auto-save on every toggle — no explicit Save button (spec §5.14)
    setError(null);
    const isAllDays = next.size === shootDays.length;
    const payload = isAllDays ? [] : Array.from(next).sort();
    startTransition(async () => {
      const result = await updateBookingCrewAssignedDatesAction({
        bookingCrewId,
        bookingId,
        assignedDates: payload,
      });
      if ('error' in result) {
        setError(result.error ?? 'Update failed');
        return;
      }
      router.refresh();
    });
  }

  const isAllDays = selected.size === shootDays.length;

  return (
    <div className="mt-2 rounded border px-2.5 py-1.5" style={{ borderColor: PALETTE.border, background: PALETTE.bg }}>
      <div className="flex items-center justify-between gap-2 mb-1.5">
        <span
          style={{
            fontFamily: 'var(--font-dm-mono), monospace',
            fontSize: 9,
            fontWeight: 500,
            letterSpacing: '0.16em',
            textTransform: 'uppercase',
            color: PALETTE.muted,
          }}
        >
          Days {pending && '·'}
        </span>
        {pending && (
          <span style={{ fontSize: 10, color: PALETTE.muted }}>Saving…</span>
        )}
      </div>
      <div className="flex flex-wrap gap-1">
        {shootDays.map((day) => {
          const on = selected.has(day);
          return (
            <button
              key={day}
              type="button"
              onClick={() => toggle(day)}
              disabled={pending}
              className="rounded px-2 py-0.5 text-[10px] font-medium transition-colors disabled:opacity-60"
              style={{
                background: on ? PALETTE.text : 'transparent',
                color: on ? PALETTE.bg : PALETTE.muted,
                border: `1px solid ${on ? PALETTE.text : PALETTE.border}`,
                cursor: 'pointer',
              }}
            >
              {formatDate(day)}
            </button>
          );
        })}
      </div>
      {!isAllDays && (
        <div className="mt-1" style={{ fontSize: 9, color: PALETTE.muted }}>
          On {selected.size} of {shootDays.length} days
        </div>
      )}
      {error && (
        <div className="mt-1" style={{ fontSize: 10, color: PALETTE.danger }}>{error}</div>
      )}
    </div>
  );
}
