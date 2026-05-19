'use client';

/**
 * Root-level error boundary. Catches errors thrown ABOVE the per-segment
 * `error.tsx` — i.e. in root layout, providers, or the React tree before
 * the first regular boundary mounts. Next.js requires this file in App
 * Router for Sentry to capture root-level errors.
 *
 * Renders a minimal HTML document because the global error boundary
 * replaces the entire app shell, including <html>/<body>.
 */

import { useEffect } from 'react';
import * as Sentry from '@sentry/nextjs';

export default function GlobalError({
  error,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    Sentry.captureException(error, {
      tags: { boundary: 'global_error', source: 'client' },
      extra: { digest: error.digest },
    });
  }, [error]);

  return (
    <html lang="en">
      <body
        style={{
          margin: 0,
          minHeight: '100vh',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          fontFamily: 'system-ui, -apple-system, sans-serif',
          background: '#f5f3ef',
          color: '#1a1916',
        }}
      >
        <div
          style={{
            maxWidth: 480,
            padding: '24px 32px',
            borderRadius: 8,
            border: '1px solid #e6e1d8',
            background: '#fff',
            textAlign: 'center',
          }}
        >
          <h1 style={{ fontSize: 18, margin: '0 0 8px', fontWeight: 600 }}>
            Atelier hit a fatal error
          </h1>
          <p style={{ fontSize: 14, color: '#6c6862', margin: 0 }}>
            The whole app couldn&apos;t render. Reload the page to try again.
          </p>
          {error.digest && (
            <p
              style={{
                marginTop: 16,
                padding: '4px 8px',
                display: 'inline-block',
                fontSize: 11,
                fontFamily: 'ui-monospace, monospace',
                color: '#6c6862',
                background: '#f5f3ef',
                borderRadius: 4,
              }}
            >
              {error.digest}
            </p>
          )}
        </div>
      </body>
    </html>
  );
}
