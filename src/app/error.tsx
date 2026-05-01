'use client';

/**
 * Per-segment error boundary. Catches runtime errors thrown anywhere
 * inside the app shell and renders a recoverable fallback. Next.js
 * resets the boundary when the user clicks "Try again" or navigates.
 *
 * Server-side errors are logged to the platform (Vercel/etc.) — this
 * file only handles the client-visible recovery flow.
 */

import { useEffect } from 'react';
import { PALETTE } from '@/lib/utils/constants';

export default function ErrorBoundary({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    // Surface in browser console for local dev; production logs go to platform
    console.error('[atelier] error boundary caught', error);
  }, [error]);

  return (
    <div
      className="min-h-screen flex items-center justify-center p-6"
      style={{ background: PALETTE.bg, color: PALETTE.text }}
    >
      <div
        className="max-w-md rounded-lg border p-6 space-y-4"
        style={{ background: PALETTE.surface, borderColor: PALETTE.border }}
      >
        <h2 className="text-lg font-semibold">Something went wrong</h2>
        <p className="text-sm" style={{ color: PALETTE.muted }}>
          The app hit an unexpected error. You can try again, or go back to the
          dashboard. If it keeps happening, check the audit log or contact
          support with the error ID below.
        </p>
        {error.digest && (
          <p
            className="text-[10px] font-mono rounded px-2 py-1 inline-block"
            style={{ background: PALETTE.bg, color: PALETTE.muted, border: `1px solid ${PALETTE.border}` }}
          >
            {error.digest}
          </p>
        )}
        <div className="flex gap-3 pt-2">
          <button
            onClick={reset}
            className="rounded px-4 py-2 text-sm font-medium"
            style={{ background: PALETTE.accent, color: PALETTE.bg, border: 'none', cursor: 'pointer' }}
          >
            Try again
          </button>
          <a
            href="/"
            className="rounded px-4 py-2 text-sm font-medium"
            style={{ background: 'transparent', color: PALETTE.muted, border: `1px solid ${PALETTE.border}` }}
          >
            Go to dashboard
          </a>
        </div>
      </div>
    </div>
  );
}
