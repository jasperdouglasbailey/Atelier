'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { cloneBookingAction } from '@/app/actions/bookings';
import { PALETTE } from '@/lib/utils/constants';

type Props = {
  /** ID of the booking to clone (typically the most-recent one for a client). */
  sourceBookingId: string;
  /** Optional label override; defaults to "Repeat last booking". */
  label?: string;
};

/**
 * Clone-booking button. Creates a copy of the source booking with dates
 * offset by 30 days, the same primary artist + auto-generated quote V1.
 * On success, navigates to the new booking detail page.
 */
export default function CloneBookingButton({ sourceBookingId, label }: Props) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function handleClick() {
    setError(null);
    startTransition(async () => {
      const result = await cloneBookingAction(sourceBookingId);
      if ('error' in result) { setError(result.error ?? 'Clone failed'); return; }
      router.push(`/bookings/${result.id}`);
    });
  }

  return (
    <div>
      <button
        type="button"
        onClick={handleClick}
        disabled={isPending}
        className="rounded-md px-3 py-1.5 text-xs font-medium disabled:opacity-50"
        style={{ background: `${PALETTE.accent}18`, color: PALETTE.accent, border: `1px solid ${PALETTE.accent}44` }}
      >
        {isPending ? 'Cloning…' : (label ?? 'Repeat last booking')}
      </button>
      {error && <p className="mt-1 text-[11px]" style={{ color: PALETTE.danger }}>{error}</p>}
    </div>
  );
}
