'use client';

import { useEffect, useState, useTransition } from 'react';
import { createClient } from '@/lib/supabase/client';
import type { KillSwitchState } from '@/lib/utils/kill-switch';
import { toggleKillSwitchAction } from '@/app/actions/kill-switch';
import { PALETTE } from '@/lib/utils/constants';

type Props = { initialState: KillSwitchState | null };

export default function KillSwitchBanner({ initialState }: Props) {
  const [state, setState] = useState<KillSwitchState | null>(initialState);
  const [isPending, startTransition] = useTransition();

  useEffect(() => {
    const supabase = createClient();
    const channel = supabase
      .channel('kill_switch_changes')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'atelier_kill_switch' },
        (payload) => {
          if (payload.eventType === 'DELETE') {
            setState(null);
          } else if (payload.new) {
            setState(payload.new as KillSwitchState);
          }
        },
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, []);

  if (!state) return null;
  if (!state.is_active && !state.pause_outbound) return null;

  const isRed = state.is_active;
  // Banner backgrounds intentionally deep — alert states must read clearly
  // in both dark and light themes. Text uses the themed danger/warning vars.
  const palette = isRed
    ? { bg: PALETTE.dangerFillDim,  border: PALETTE.dangerFillBorder,  text: 'var(--p-danger)',  btn: PALETTE.dangerFill  }
    : { bg: PALETTE.warningFillDim, border: PALETTE.warningFillBorder, text: 'var(--p-warning)', btn: PALETTE.warningFill };

  const message = isRed
    ? 'KILL SWITCH ACTIVE — All agents paused, outbound held'
    : 'Outbound paused — drafts held, nothing sends externally';

  const field: 'is_active' | 'pause_outbound' = isRed ? 'is_active' : 'pause_outbound';

  const onResume = () => {
    startTransition(async () => {
      await toggleKillSwitchAction(field);
    });
  };

  return (
    <div
      role="alert"
      className="flex w-full flex-col gap-2 px-4 py-3 text-sm sm:flex-row sm:items-center sm:justify-between"
      style={{ background: palette.bg, color: palette.text, borderBottom: `1px solid ${palette.border}` }}
    >
      <div className="flex items-center gap-2 font-medium">
        <span aria-hidden className="h-2 w-2 rounded-full" style={{ background: palette.text }} />
        <span>{message}</span>
      </div>
      <button
        onClick={onResume}
        disabled={isPending}
        className="w-full rounded-md px-4 py-2 text-xs font-semibold uppercase tracking-wide transition-opacity disabled:opacity-50 sm:w-auto"
        style={{ background: palette.btn, color: '#fff' }}
      >
        {isPending ? 'Resuming…' : 'Resume'}
      </button>
    </div>
  );
}
