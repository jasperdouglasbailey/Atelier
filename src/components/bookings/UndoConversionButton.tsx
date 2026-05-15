'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { undoBookingConversionAction } from '@/app/actions/bookings';
import { PALETTE } from '@/lib/utils/constants';

/**
 * "Undo conversion" affordance — shown on the booking detail page when:
 *   - the booking was auto-created from a Gmail message (source_gmail_message_id set)
 *   - it's still in brief_received state
 *   - created less than 24h ago
 *
 * Clicking deletes the booking row (FK cascade handles related). The Gmail
 * message then re-appears in /inbox Potential Briefs on the next scan because
 * findPotentialBriefs filters out converted source IDs and that filter is now
 * empty for this message.
 *
 * Visually distinguished from regular Delete: amber (not red) because this is
 * a "you didn't mean to do this" affordance, not a destructive permanent action.
 */
export default function UndoConversionButton({ bookingId, createdAt }: { bookingId: string; createdAt: string }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [confirming, setConfirming] = useState(false);

  // Lazy initializer evaluates Date.now() once at mount — pure under
  // the react-hooks/purity lint rule. After 24h we hide the button
  // entirely; the server enforces the same window so a click would
  // be rejected anyway.
  const [isEligible] = useState(
    () => (Date.now() - new Date(createdAt).getTime()) < 24 * 3600 * 1000,
  );

  if (!isEligible) return null;

  function handleClick() {
    if (!confirming) {
      setConfirming(true);
      // Auto-cancel the confirmation prompt after 5s if the user moves on.
      setTimeout(() => setConfirming(false), 5000);
      return;
    }
    setError(null);
    startTransition(async () => {
      const result = await undoBookingConversionAction(bookingId);
      if (!result.ok) {
        setError(result.error);
        setConfirming(false);
        return;
      }
      router.push('/inbox');
      router.refresh();
    });
  }

  return (
    <div className="flex flex-col items-end gap-1">
      <button
        type="button"
        onClick={handleClick}
        disabled={pending}
        className="rounded px-2 py-0.5 text-[11px] font-medium disabled:opacity-50"
        style={{
          background: confirming ? PALETTE.warning : `${PALETTE.warning}18`,
          color: confirming ? PALETTE.bg : PALETTE.warning,
          border: `1px solid ${PALETTE.warning}55`,
          cursor: pending ? 'wait' : 'pointer',
        }}
        title="Delete this booking and let the email reappear in Potential Briefs"
      >
        {pending ? 'Undoing…'
          : confirming ? 'Click again to confirm'
          : 'Undo conversion'}
      </button>
      {confirming && !pending && (
        <span className="text-[10px]" style={{ color: PALETTE.muted }}>
          Email will reappear in Potential Briefs
        </span>
      )}
      {error && (
        <span className="text-[10px]" style={{ color: PALETTE.danger }}>{error}</span>
      )}
    </div>
  );
}
