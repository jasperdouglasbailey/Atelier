'use client';

import { useState, useTransition } from 'react';
import { regenerateQuoteV1Action } from '@/app/actions/bookings';
import { PALETTE } from '@/lib/utils/constants';

type Props = {
  bookingId: string;
  /** Optional discipline label for button text ("photographer" / "videographer"). */
  discipline?: string | null;
  /** Optional day-rate to display in the button label. */
  dayRate?: number | null;
};

/**
 * One-click "Generate Quote V1 from artist's discipline template" button.
 * Used on the booking detail page (inside QuoteBuilder's empty state) for
 * legacy bookings that don't have a quote yet.
 *
 * Refuses if a quote already exists — caller must surface only when
 * `quoteVersions.length === 0`.
 */
export default function RegenerateQuoteV1Button({ bookingId, discipline, dayRate }: Props) {
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function handleClick() {
    setError(null);
    startTransition(async () => {
      const result = await regenerateQuoteV1Action(bookingId);
      if ('error' in result && result.error) setError(result.error);
    });
  }

  const dayRateLabel = dayRate ? ` ($${dayRate.toLocaleString()} day rate)` : '';
  const disciplineLabel = discipline === 'photographer' || discipline === 'videographer'
    ? ` (${discipline})`
    : '';

  return (
    <div className="space-y-1.5">
      <button
        type="button"
        onClick={handleClick}
        disabled={isPending}
        className="rounded-md px-3 py-2 text-xs font-semibold disabled:opacity-50"
        style={{ background: PALETTE.accent, color: PALETTE.bg }}
      >
        {isPending ? 'Generating…' : `Auto-generate V1${disciplineLabel}${dayRateLabel}`}
      </button>
      {error && (
        <p className="text-[11px]" style={{ color: PALETTE.danger }}>{error}</p>
      )}
    </div>
  );
}
