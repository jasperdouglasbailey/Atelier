'use client';

import { useOptimistic, useTransition } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { toggleKillSwitchAction } from '@/app/actions/kill-switch';
import type { KillSwitchState } from '@/lib/types/database';
import { PALETTE } from '@/lib/utils/constants';
import SectionCard from '@/components/ui/SectionCard';

/**
 * Compact kill-switch control on the dashboard so the operator can hit
 * Full Freeze or Pause Outbound without navigating to /settings.
 *
 * Same useOptimistic pattern as /settings — flips instantly, server
 * confirms in the background. The /settings link in the header gives
 * full controls (agency profile, integrations, etc.).
 */
export default function SettingsSnapshot({ killSwitch }: { killSwitch: KillSwitchState | null }) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [isActive, setOptimisticActive] = useOptimistic(killSwitch?.is_active ?? false);
  const [isPaused, setOptimisticPaused] = useOptimistic(killSwitch?.pause_outbound ?? false);

  function handleToggle(field: 'is_active' | 'pause_outbound') {
    if (isPending) return;
    startTransition(async () => {
      if (field === 'is_active') setOptimisticActive(!isActive);
      else setOptimisticPaused(!isPaused);
      await toggleKillSwitchAction(field);
      router.refresh();
    });
  }

  const level = isActive ? 'Red' : isPaused ? 'Amber' : 'Green';
  const levelColor = isActive ? PALETTE.danger : isPaused ? PALETTE.warning : PALETTE.success;
  const levelDesc = isActive
    ? 'All agent activity halted.'
    : isPaused
    ? 'Drafts only — nothing sends.'
    : 'All systems operational.';

  return (
    <SectionCard
      title="Kill switch"
      meta={<span style={{ color: levelColor }}>{level}</span>}
      action={{ label: 'Open settings', href: '/settings' }}
    >
      <p className="text-[11px]" style={{ color: PALETTE.muted }}>{levelDesc}</p>

      <div className="mt-3 space-y-2">
        <CompactToggle
          label="Full freeze"
          checked={isActive}
          color={PALETTE.danger}
          onChange={() => handleToggle('is_active')}
        />
        <CompactToggle
          label="Pause outbound"
          checked={isPaused}
          color={PALETTE.warning}
          onChange={() => handleToggle('pause_outbound')}
        />
      </div>

      <Link
        href="/settings/partners"
        className="mt-3 inline-block text-[10px] underline"
        style={{ color: PALETTE.muted }}
      >
        Manage partner accounts →
      </Link>
    </SectionCard>
  );
}

function CompactToggle({
  label, checked, color, onChange,
}: {
  label: string;
  checked: boolean;
  color: string;
  onChange: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onChange}
      className="flex w-full items-center justify-between rounded px-2 py-1.5 text-left"
      style={{ background: PALETTE.bg, border: `1px solid ${PALETTE.border}` }}
      aria-pressed={checked}
    >
      <span className="text-[11px]" style={{ color: PALETTE.text }}>{label}</span>
      <span
        className="relative inline-block h-4 w-7 rounded-full"
        style={{ background: checked ? color : PALETTE.border, transition: 'background 0.15s' }}
      >
        <span
          className="absolute top-0.5 left-0.5 h-3 w-3 rounded-full bg-white"
          style={{ transform: checked ? 'translateX(12px)' : 'translateX(0)', transition: 'transform 0.15s' }}
        />
      </span>
    </button>
  );
}
