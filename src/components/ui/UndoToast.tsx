'use client';

import { useEffect } from 'react';
import { PALETTE } from '@/lib/utils/constants';

/**
 * Inline undo toast — shared across the dismiss-brief, reject-approval,
 * delete-fee-line, and delete-schedule-row flows. Sits inside the panel
 * that triggered the action, not as a global toast queue.
 *
 * Visible for `lifetimeMs` (default 8000ms). Clicking Undo calls onUndo
 * immediately. Clicking Dismiss (✕) clears the toast without undoing.
 * The toast auto-dismisses on timer; the underlying action stays applied.
 *
 * Visual treatment matches PR#118's dismiss-brief toast for consistency:
 * left-border accent in warning amber, soft amber background, Undo link
 * styled as a coloured link.
 */
export default function UndoToast({
  message,
  onUndo,
  onDismiss,
  lifetimeMs = 8000,
}: {
  message: React.ReactNode;
  onUndo: () => void;
  onDismiss: () => void;
  lifetimeMs?: number;
}) {
  useEffect(() => {
    const timer = setTimeout(onDismiss, lifetimeMs);
    return () => clearTimeout(timer);
  }, [onDismiss, lifetimeMs]);

  return (
    <div
      role="status"
      className="mt-3 flex items-center justify-between gap-3 rounded-md border-l-2 px-3 py-2"
      style={{ background: `${PALETTE.warning}10`, borderColor: PALETTE.warning, color: PALETTE.text }}
    >
      <span className="text-[11px]">{message}</span>
      <div className="flex items-center gap-3 flex-none">
        <button
          type="button"
          onClick={onUndo}
          className="text-[11px] font-semibold underline"
          style={{ color: PALETTE.warning, cursor: 'pointer' }}
        >
          Undo
        </button>
        <button
          type="button"
          onClick={onDismiss}
          className="text-[11px] leading-none"
          style={{ color: PALETTE.muted, cursor: 'pointer' }}
          aria-label="Dismiss toast"
        >
          ✕
        </button>
      </div>
    </div>
  );
}
