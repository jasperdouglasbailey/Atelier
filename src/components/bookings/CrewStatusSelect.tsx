'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { updateCrewStatusAction } from '@/app/actions/crew-status';
import { PALETTE, CREW_STATUS_OPTIONS } from '@/lib/utils/constants';

type Props = {
  bookingCrewId: string;
  bookingId: string;
  status: string;
};

const STATUS_LABELS: Record<string, string> = {
  hold_requested: 'Hold requested',
  sent: 'Hold sent',
  confirmed: 'Confirmed',
  declined: 'Declined',
  released: 'Released',
};

const STATUS_COLORS: Record<string, string> = {
  hold_requested: PALETTE.warning,
  sent: PALETTE.accent,
  confirmed: PALETTE.success,
  declined: PALETTE.danger,
  released: PALETTE.muted,
};

export default function CrewStatusSelect({ bookingCrewId, bookingId, status }: Props) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [current, setCurrent] = useState(status);

  const onChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const next = e.target.value;
    if (next === current) return;
    const prev = current;
    setCurrent(next);
    startTransition(async () => {
      const result = await updateCrewStatusAction({
        bookingCrewId,
        bookingId,
        newStatus: next,
        oldStatus: prev,
      });
      if ('error' in result) {
        setCurrent(prev);
        alert(`Update failed: ${result.error}`);
      } else {
        router.refresh();
      }
    });
  };

  const colour = STATUS_COLORS[current] ?? PALETTE.muted;

  return (
    <select
      value={current}
      onChange={onChange}
      disabled={isPending}
      className="rounded border bg-transparent px-1.5 py-0.5 text-[10px] font-medium disabled:opacity-50"
      style={{
        borderColor: `${colour}66`,
        color: colour,
        background: `${colour}11`,
      }}
      onClick={(e) => e.stopPropagation()}
      aria-label="Crew booking status"
    >
      {CREW_STATUS_OPTIONS.map((s) => (
        <option key={s} value={s} style={{ background: PALETTE.bg, color: PALETTE.text }}>
          {STATUS_LABELS[s] ?? s}
        </option>
      ))}
    </select>
  );
}
