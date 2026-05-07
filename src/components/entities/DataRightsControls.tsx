'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { anonymiseTalentAction, anonymiseClientAction, anonymiseCrewAction } from '@/app/actions/entities';
import { PALETTE } from '@/lib/utils/constants';

type Props = {
  type: 'talent' | 'client' | 'crew';
  id: string;
  name: string;
};

/**
 * Data-rights controls per Australian Privacy Principles 12 + 13.
 *
 *   Export — APP 12 (access). Downloads a JSON of every row referencing
 *            this entity. Owner/partner only (server-enforced).
 *   Anonymise — APP 13 (correction / erasure). Replaces PII with a
 *               random anonymised label. Booking/fee-line references
 *               stay intact so financial history isn't lost. One-way.
 */
export default function DataRightsControls({ type, id, name }: Props) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [confirming, setConfirming] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const exportUrl = `/api/export/${type}/${id}`;

  function handleAnonymise() {
    setError(null);
    startTransition(async () => {
      const action = type === 'talent'
        ? anonymiseTalentAction
        : type === 'client'
        ? anonymiseClientAction
        : anonymiseCrewAction;
      const result = await action(id);
      if ('error' in result && result.error) {
        setError(result.error);
        setConfirming(false);
        return;
      }
      router.push(`/${type}`);
      router.refresh();
    });
  }

  return (
    <div className="rounded-lg border p-4" style={{ background: PALETTE.surface, borderColor: PALETTE.border }}>
      <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide" style={{ color: PALETTE.muted }}>
        Privacy & data rights
      </h3>
      <p className="mb-3 text-[11px]" style={{ color: PALETTE.muted }}>
        Australian Privacy Principles. Export = APP 12 (access). Anonymise = APP 13 (erasure).
        Anonymise replaces PII with a random label and keeps financial history intact.
        One-way.
      </p>

      <div className="flex flex-wrap gap-2">
        <a
          href={exportUrl}
          download
          className="rounded px-3 py-1.5 text-xs font-medium"
          style={{
            background: `${PALETTE.accent}18`,
            color: PALETTE.accent,
            border: `1px solid ${PALETTE.accent}44`,
          }}
        >
          Export all data (JSON)
        </a>

        {confirming ? (
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-[11px]" style={{ color: PALETTE.danger }}>
              Anonymise {name}? PII gone forever — you cannot undo this.
            </span>
            <button
              type="button"
              onClick={handleAnonymise}
              disabled={pending}
              className="rounded px-3 py-1.5 text-xs font-medium disabled:opacity-50"
              style={{ background: PALETTE.danger, color: '#fff', border: 'none', cursor: 'pointer' }}
            >
              {pending ? 'Anonymising…' : 'Confirm anonymise'}
            </button>
            <button
              type="button"
              onClick={() => setConfirming(false)}
              className="rounded px-3 py-1.5 text-xs font-medium"
              style={{ background: 'transparent', color: PALETTE.muted, border: `1px solid ${PALETTE.border}`, cursor: 'pointer' }}
            >
              Cancel
            </button>
          </div>
        ) : (
          <button
            type="button"
            onClick={() => setConfirming(true)}
            className="rounded px-3 py-1.5 text-xs font-medium"
            style={{
              background: `${PALETTE.danger}18`,
              color: PALETTE.danger,
              border: `1px solid ${PALETTE.danger}44`,
              cursor: 'pointer',
            }}
          >
            Anonymise (right to be forgotten)
          </button>
        )}
      </div>

      {error && (
        <div className="mt-2 text-[11px]" style={{ color: PALETTE.danger }}>
          {error}
        </div>
      )}
    </div>
  );
}
