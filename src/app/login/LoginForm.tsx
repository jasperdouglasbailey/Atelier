'use client';

import { useEffect, useState } from 'react';
import { signInWithEmailAction } from '@/app/actions/auth';
import { PALETTE } from '@/lib/utils/constants';

/**
 * When Supabase redirects with an error, the error details may live in
 * the URL hash fragment (#error=...&error_description=...). Hash isn't
 * sent to the server, so the login server component can't display them.
 * This client-side reader extracts and surfaces them, then strips the
 * hash so a refresh doesn't re-show the same error.
 */
function readHashError(): string | null {
  if (typeof window === 'undefined') return null;
  const hash = window.location.hash;
  if (!hash || hash.length < 2) return null;

  const params = new URLSearchParams(hash.slice(1));
  const errorCode = params.get('error_code');
  const errorDesc = params.get('error_description');

  if (!errorCode && !errorDesc) return null;

  const friendly =
    errorCode === 'otp_expired'
      ? 'That sign-in link has expired (links are valid for ~1 hour, and only the most recent one works). Request a new one below.'
      : errorDesc?.replace(/\+/g, ' ') ?? 'Sign-in failed. Please request a new link.';

  return friendly;
}

export default function LoginForm() {
  const [submitting, setSubmitting] = useState(false);
  const [sent, setSent] = useState(false);
  // Initial error reads from URL hash fragment (where Supabase puts errors
  // like otp_expired). Lazy initial state means we don't need setState in
  // an effect, which keeps the react-compiler lint happy.
  const [error, setError] = useState<string | null>(() => readHashError());

  // Once mounted, clear the hash from the URL so a refresh doesn't re-show.
  useEffect(() => {
    if (typeof window !== 'undefined' && window.location.hash.includes('error')) {
      const url = window.location.pathname + window.location.search;
      window.history.replaceState({}, '', url);
    }
  }, []);

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
