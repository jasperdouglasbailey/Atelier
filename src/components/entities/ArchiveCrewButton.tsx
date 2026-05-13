'use client';

import { useState, useTransition } from 'react';
import { setCrewActiveAction } from '@/app/actions/entities';
import { PALETTE } from '@/lib/utils/constants';

type Props = { crewId: string; currentlyActive: boolean };

export default function ArchiveCrewButton({ crewId, currentlyActive }: Props) {
  const [pending, startTransition] = useTransition();
  const [confirming, setConfirming] = useState(false);

  const handleClick = () => {
    if (!currentlyActive) {
      startTransition(() => { setCrewActiveAction(crewId, true); });
      return;
    }
    if (!confirming) {
      setConfirming(true);
      setTimeout(() => setConfirming(false), 4000);
      return;
    }
    startTransition(() => { setCrewActiveAction(crewId, false); });
    setConfirming(false);
  };

  const label = !currentlyActive
    ? 'Reactivate'
    : confirming ? 'Click to confirm archive' : 'Archive';

  return (
    <button
      onClick={handleClick}
      disabled={pending}
      className="rounded px-3 py-1 text-xs font-medium transition-colors disabled:opacity-50"
      style={{
        background: confirming ? `${PALETTE.danger}22` : PALETTE.surface,
        color: confirming ? PALETTE.danger : PALETTE.muted,
        border: `1px solid ${confirming ? PALETTE.danger : PALETTE.border}`,
        cursor: 'pointer',
      }}
      title={currentlyActive
        ? 'Soft-archive: hides from active lists. Bookings + history preserved.'
        : 'Reactivate this crew member so they appear in active lists again.'}
    >
      {pending ? '…' : label}
    </button>
  );
}
