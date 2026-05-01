'use client';

import { useState } from 'react';
import { signInWithEmailAction } from '@/app/actions/auth';
import { PALETTE } from '@/lib/utils/constants';

export default function LoginForm() {
  const [submitting, setSubmitting] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setSubmitting(true);
    setError(null);

    const fd = new FormData(e.currentTarget);
    const result = await signInWithEmailAction(fd);

    setSubmitting(false);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    setSent(true);
  }

  if (sent) {
    return (
      <div className="space-y-3 text-center">
        <p className="text-sm" style={{ color: PALETTE.text }}>
          Check your inbox.
        </p>
        <p className="text-xs" style={{ color: PALETTE.muted }}>
          If your email is on the access list, a sign-in link is on its way.
          The link expires in 1 hour.
        </p>
        <button
          type="button"
          onClick={() => { setSent(false); setError(null); }}
          className="text-xs underline"
          style={{ color: PALETTE.muted }}
        >
          Use a different email
        </button>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div>
        <label
          htmlFor="email"
          className="block text-[10px] font-semibold uppercase tracking-wider mb-1.5"
          style={{ color: PALETTE.muted }}
        >
          Email
        </label>
        <input
          id="email"
          name="email"
          type="email"
          required
          autoFocus
          autoComplete="email"
          placeholder="you@saundersandco.com"
          className="w-full rounded-md px-3 py-2 text-sm"
          style={{
            background: PALETTE.bg,
            color: PALETTE.text,
            border: `1px solid ${PALETTE.border}`,
            outline: 'none',
          }}
        />
      </div>

      {error && (
        <div
          className="rounded px-3 py-2 text-xs"
          style={{ color: PALETTE.danger, background: `${PALETTE.danger}15` }}
        >
          {error}
        </div>
      )}

      <button
        type="submit"
        disabled={submitting}
        className="w-full rounded-md px-4 py-2 text-sm font-medium disabled:opacity-50"
        style={{ background: PALETTE.accent, color: PALETTE.bg, cursor: 'pointer', border: 'none' }}
      >
        {submitting ? 'Sending…' : 'Send sign-in link'}
      </button>

      <p className="text-[11px]" style={{ color: PALETTE.muted }}>
        We&apos;ll email you a one-time link. No password needed.
      </p>
    </form>
  );
}
