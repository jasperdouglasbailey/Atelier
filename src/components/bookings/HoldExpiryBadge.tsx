'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { updateHoldExpiryAction } from '@/app/actions/quotes';
import { PALETTE } from '@/lib/utils/constants';

type Props = {
  tableKind: 'talent' | 'crew';
  id: string;
  bookingId: string;
  /** ISO timestamp string, or null when no hold expiry is tracked. */
  expiresAt: string | null;
  /** True once the row is confirmed — badge hides since the hold is moot. */
  isConfirmed: boolean;
};

function daysUntil(iso: string): number {
  const ms = new Date(iso).getTime() - Date.now();
  // Round toward zero so "in 0.4 days" reads as "today", and "-0.1 days" reads as "expired".
  return Math.ceil(ms / (24 * 60 * 60 * 1000));
}

function toDateInputValue(iso: string | null): string {
  if (!iso) return '';
  return new Date(iso).toISOString().slice(0, 10);
}

export default function HoldExpiryBadge({ tableKind, id, bookingId, expiresAt, isConfirmed }: Props) {
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState<string>(toDateInputValue(expiresAt));
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  // Confirmed rows don't need a hold sunset.
  if (isConfirmed) return null;

  // Compute display state from expiry timestamp.
  const days = expiresAt ? daysUntil(expiresAt) : null;
  const expired = days != null && days < 0;
  const urgent = days != null && days >= 0 && days <= 3;
  const soon = days != null && days > 3 && days <= 7;
  const color = expired ? PALETTE.danger : urgent ? PALETTE.danger : soon ? PALETTE.warning : PALETTE.muted;

  let label: string;
  if (!expiresAt) {
    label = 'Set hold expiry';
  } else if (expired) {
    label = `Hold expired ${Math.abs(days!)}d ago`;
  } else if (days === 0) {
    label = 'Hold expires today';
  } else if (days === 1) {
    label = 'Hold expires tomorrow';
  } else {
    label = `Hold expires in ${days}d`;
  }

  function save(nextValueIso: string | null) {
    setError(null);
    startTransition(async () => {
      const result = await updateHoldExpiryAction({
        tableKind,
        id,
        bookingId,
        expiresAt: nextValueIso,
      });
      if ('error' in result) {
        setError(result.error ?? 'Failed to save');
        return;
      }
      setEditing(false);
      router.refresh();
    });
  }

  function commitDraft() {
    if (!draft) {
      save(null);
      return;
    }
    // Anchor at 9am Sydney for a sensible default — keeps the UI predictable.
    const iso = new Date(`${draft}T09:00:00+10:00`).toISOString();
    save(iso);
  }

  if (editing) {
    return (
      <span className="inline-flex items-center gap-1">
        <input
          type="date"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          className="rounded border px-1.5 py-0.5 text-[10px]"
          style={{ background: PALETTE.bg, borderColor: PALETTE.border, color: PALETTE.text }}
          disabled={pending}
        />
        <button
          onClick={commitDraft}
          disabled={pending}
          className="text-[10px] font-medium"
          style={{ color: PALETTE.accent }}
        >
          {pending ? 'Saving…' : 'Save'}
        </button>
        {expiresAt && (
          <button
            onClick={() => save(null)}
            disabled={pending}
            className="text-[10px]"
            style={{ color: PALETTE.danger }}
            title="Clear the hold expiry"
          >
            Clear
          </button>
        )}
        <button
          onClick={() => { setEditing(false); setDraft(toDateInputValue(expiresAt)); }}
          disabled={pending}
          className="text-[10px]"
          style={{ color: PALETTE.muted }}
        >
          Cancel
        </button>
        {error && <span className="text-[10px]" style={{ color: PALETTE.danger }}>{error}</span>}
      </span>
    );
  }

  return (
    <button
      type="button"
      onClick={() => { setEditing(true); setDraft(toDateInputValue(expiresAt)); }}
      className="inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-[10px] font-medium transition-opacity hover:opacity-80"
      style={{
        background: expired || urgent ? `${color}18` : 'transparent',
        color,
        border: `1px solid ${expired || urgent ? `${color}55` : PALETTE.border}`,
      }}
      title={expiresAt ? `Click to change · ${new Date(expiresAt).toLocaleString()}` : 'Click to set'}
    >
      {label}
    </button>
  );
}
