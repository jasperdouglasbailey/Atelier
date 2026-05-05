'use client';

import { useState } from 'react';
import { sendOnboardingLinkAction } from '@/app/actions/onboarding';
import { PALETTE } from '@/lib/utils/constants';

/**
 * Button on talent/crew detail pages that generates an onboarding token,
 * emails the magic link, and reports back what happened. If Gmail isn't
 * configured (dev) it returns the URL inline so the owner can copy it.
 */
export default function SendOnboardingLinkButton({
  type,
  entityId,
  hasEmail,
}: {
  type: 'talent' | 'crew';
  entityId: string;
  hasEmail: boolean;
}) {
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<
    | { kind: 'sent'; to: string }
    | { kind: 'manual'; url: string; reason: string }
    | { kind: 'error'; msg: string }
    | null
  >(null);

  async function handleClick() {
    setBusy(true);
    setResult(null);
    const res = await sendOnboardingLinkAction(type, entityId);
    if (!res.ok) {
      setResult({ kind: 'error', msg: res.error });
    } else if (res.mode === 'sent') {
      setResult({ kind: 'sent', to: res.to });
    } else {
      setResult({ kind: 'manual', url: res.url, reason: res.reason });
    }
    setBusy(false);
  }

  const disabled = busy || !hasEmail;

  return (
    <div className="flex flex-col items-end gap-1">
      <button
        type="button"
        onClick={handleClick}
        disabled={disabled}
        className="rounded px-3 py-1 text-xs font-medium disabled:opacity-40"
        style={{ background: PALETTE.surface, color: PALETTE.muted, border: `1px solid ${PALETTE.border}` }}
        title={!hasEmail ? 'Add an email first' : 'Email a personal onboarding link'}
      >
        {busy ? 'Sending…' : '✉ Send onboarding link'}
      </button>
      {result?.kind === 'sent' && (
        <span className="text-[10px]" style={{ color: PALETTE.accent }}>Sent to {result.to}</span>
      )}
      {result?.kind === 'manual' && (
        <span className="text-[10px] max-w-xs text-right" style={{ color: PALETTE.muted }}>
          {result.reason}
          <br />
          <a href={result.url} className="underline break-all" style={{ color: PALETTE.accent }}>{result.url}</a>
        </span>
      )}
      {result?.kind === 'error' && (
        <span className="text-[10px]" style={{ color: PALETTE.danger }}>{result.msg}</span>
      )}
    </div>
  );
}
