'use client';

import type { SaveStatus } from '@/lib/hooks/useAutoSave';
import { PALETTE } from '@/lib/utils/constants';

export default function SaveIndicator({ status }: { status: SaveStatus }) {
  if (status === 'idle') return null;

  const color =
    status === 'saved' ? PALETTE.success
    : status === 'error' ? PALETTE.danger
    : PALETTE.muted;

  const label =
    status === 'saving' ? 'Saving…'
    : status === 'saved' ? '✓ Saved'
    : '⚠ Save failed — try again';

  return (
    <span
      className="text-[11px] transition-opacity"
      style={{ color, opacity: 1 }}
    >
      {label}
    </span>
  );
}
