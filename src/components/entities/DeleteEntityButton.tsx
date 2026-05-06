'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { deleteCrewAction, deleteTalentAction } from '@/app/actions/entities';
import { PALETTE } from '@/lib/utils/constants';

type Props = {
  type: 'crew' | 'talent';
  id: string;
  name: string;
  /** Where to navigate after a successful delete. Default: /<type>. */
  redirectTo?: string;
  /** Render compact (small) vs full button. */
  size?: 'sm' | 'md';
};

/**
 * Hard-delete button for crew or talent.
 *
 * Behaviour:
 *   - Two-step confirmation (click reveals confirm bar)
 *   - Refuses on the server side if there are booking references; the
 *     server-returned error message is shown inline instead of throwing.
 *   - On success, navigates to the list page and refreshes.
 */
export default function DeleteEntityButton({ type, id, name, redirectTo, size = 'md' }: Props) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [confirming, setConfirming] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function handleDelete() {
    setError(null);
    startTransition(async () => {
      const action = type === 'crew' ? deleteCrewAction : deleteTalentAction;
      const result = await action(id);
      if ('error' in result && result.error) {
        setError(result.error);
        setConfirming(false);
        return;
      }
      router.push(redirectTo ?? `/${type}`);
      router.refresh();
    });
  }

  const padding = size === 'sm' ? 'px-2 py-1' : 'px-3 py-1.5';
  const fontSize = size === 'sm' ? 10 : 12;

  if (confirming) {
    return (
      <div className="flex items-center gap-2">
        <span className="text-[11px]" style={{ color: PALETTE.danger }}>
          Delete {name}? This cannot be undone.
        </span>
        <button
          type="button"
          onClick={handleDelete}
          disabled={pending}
          className={`${padding} rounded font-medium disabled:opacity-50`}
          style={{ background: PALETTE.danger, color: '#fff', border: 'none', fontSize, cursor: 'pointer' }}
        >
          {pending ? 'Deleting…' : 'Confirm delete'}
        </button>
        <button
          type="button"
          onClick={() => setConfirming(false)}
          className={`${padding} rounded font-medium`}
          style={{ background: 'transparent', color: PALETTE.muted, border: `1px solid ${PALETTE.border}`, fontSize, cursor: 'pointer' }}
        >
          Cancel
        </button>
      </div>
    );
  }

  return (
    <div className="flex items-center gap-2">
      <button
        type="button"
        onClick={() => setConfirming(true)}
        className={`${padding} rounded font-medium`}
        style={{
          background: `${PALETTE.danger}18`,
          color: PALETTE.danger,
          border: `1px solid ${PALETTE.danger}44`,
          fontSize,
          cursor: 'pointer',
        }}
      >
        Delete
      </button>
      {error && (
        <span className="text-[11px]" style={{ color: PALETTE.danger }}>
          {error}
        </span>
      )}
    </div>
  );
}
