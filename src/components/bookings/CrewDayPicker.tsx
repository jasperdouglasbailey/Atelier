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

  // "All days" mode = NULL in DB. Local state mirrors that with a Set.
  // If assignedDates is null/empty, treat as "all days selected".
  const initial = new Set<string>(
    (assignedDates && assignedDates.length > 0) ? assignedDates : shootDays,
  );
  const [selected, setSelected] = useState<Set<string>>(initial);

  const isAllDays = selected.size === shootDays.length;

  function toggle(day: string) {
    const next = new Set(selected);
    if (next.has(day)) next.delete(day);
    else next.add(day);
    setSelected(next);
  }

  function save() {
    setError(null);
    // Send empty array when all days are selected (DB stores NULL = "all").
    const payload = isAllDays ? [] : Array.from(selected).sort();
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

  return (
    <div className="mt-2 rounded border px-2.5 py-1.5" style={{ borderColor: PALETTE.border, background: PALETTE.bg }}>
      <div className="flex items-center justify-between gap-2 mb-1.5">
        <span className="text-[9px] font-semibold uppercase tracking-widest" style={{ color: PALETTE.muted }}>
          Days
        </span>
        <button
          type="button"
          onClick={save}
          disabled={pending}
          className="text-[10px] font-medium rounded px-2 py-0.5 disabled:opacity-50"
          style={{ background: PALETTE.text, color: PALETTE.bg, border: 'none', cursor: 'pointer' }}
        >
          {pending ? 'Saving…' : 'Save'}
        </button>
      </div>
      <div className="flex flex-wrap gap-1">
        {shootDays.map((day) => {
          const on = selected.has(day);
          return (
            <button
              key={day}
              type="button"
              onClick={() => toggle(day)}
              className="rounded px-2 py-0.5 text-[10px] font-medium transition-colors"
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
        <div className="mt-1 text-[9px]" style={{ color: PALETTE.muted }}>
          On {selected.size} of {shootDays.length} days
        </div>
      )}
      {error && (
        <div className="mt-1 text-[10px]" style={{ color: PALETTE.danger }}>{error}</div>
      )}
    </div>
  );
}
