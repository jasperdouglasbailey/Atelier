'use client';

import { useState } from 'react';

export default function KillSwitchBanner({ message }: { message?: string }) {
  const [dismissed, setDismissed] = useState(false);

  if (dismissed || !message) return null;

  return (
    <div
      className="flex items-center justify-between px-4 py-2 text-sm"
      style={{ background: '#3d1a1a', color: '#f87171', borderBottom: '1px solid #5c2626' }}
    >
      <span>{message}</span>
      <button
        onClick={() => setDismissed(true)}
        className="ml-4 text-xs opacity-60 hover:opacity-100 transition-opacity"
        aria-label="Dismiss"
      >
        ✕
      </button>
    </div>
  );
}
