'use client';

import { useState, useTransition } from 'react';
import { retryLocationDriveFolderAction } from '@/app/actions/locations';
import { PALETTE } from '@/lib/utils/constants';

type Props = { locationId: string };

/**
 * Inline button shown on a location detail page when the auto-create-on-save
 * Drive folder didn't land (no credentials at the time, or API blip).
 * Calls the idempotent retry server action; on success the page refresh
 * picks up the new drive_folder_link.
 */
export default function RetryDriveFolderButton({ locationId }: Props) {
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function handleRetry() {
    setError(null);
    startTransition(async () => {
      const result = await retryLocationDriveFolderAction(locationId);
      if ('error' in result && result.error) setError(result.error);
    });
  }

  return (
    <div className="rounded-lg border px-4 py-3 mb-6" style={{ borderColor: PALETTE.border, background: PALETTE.surface }}>
      <div className="flex items-center justify-between gap-3">
        <div className="text-xs" style={{ color: PALETTE.muted }}>
          No Google Drive folder linked yet for this location.
        </div>
        <button
          type="button"
          onClick={handleRetry}
          disabled={isPending}
          className="rounded px-3 py-1.5 text-xs font-medium disabled:opacity-50"
          style={{ background: `${PALETTE.accent}18`, color: PALETTE.accent, border: `1px solid ${PALETTE.accent}44` }}
        >
          {isPending ? 'Creating folder…' : 'Create Drive folder'}
        </button>
      </div>
      {error && (
        <p className="mt-2 text-[11px]" style={{ color: PALETTE.danger }}>{error}</p>
      )}
    </div>
  );
}
