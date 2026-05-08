'use client';

/**
 * Collapsible city group — used on the Crew + Talent lists.
 *
 * Click the city header to collapse / expand. State persists to
 * localStorage per city so a producer who always works out of Sydney
 * can keep "Melbourne" collapsed across page loads. The first paint is
 * always expanded (no flicker on hydration mismatch); the saved state
 * is applied on the client after mount.
 */

import { useEffect, useState } from 'react';
import { PALETTE } from '@/lib/utils/constants';

type Props = {
  /** Stable identifier — typically the city name. Used as the localStorage key. */
  storageKey: string;
  /** Display label. */
  label: string;
  /** Member count shown next to the label. */
  count: number;
  /** Member-noun for the count (e.g. "crew member" / "talent"). */
  countLabel?: string;
  children: React.ReactNode;
};

const STORAGE_PREFIX = 'cityGroup:';

export default function CollapsibleCityGroup({ storageKey, label, count, countLabel = 'member', children }: Props) {
  // Initial state is always expanded — avoids a hydration flash on the
  // first SSR paint. The client effect below applies the persisted state.
  const [collapsed, setCollapsed] = useState(false);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const saved = window.localStorage.getItem(`${STORAGE_PREFIX}${storageKey}`);
    // eslint-disable-next-line react-hooks/set-state-in-effect -- one-shot read of persisted preference after hydration; intentional pattern to avoid SSR/CSR mismatch
    if (saved === '1') setCollapsed(true);
  }, [storageKey]);

  function toggle() {
    setCollapsed((prev) => {
      const next = !prev;
      try {
        if (typeof window !== 'undefined') {
          window.localStorage.setItem(`${STORAGE_PREFIX}${storageKey}`, next ? '1' : '0');
        }
      } catch { /* localStorage may be disabled — ignore */ }
      return next;
    });
  }

  return (
    <section>
      <button
        type="button"
        onClick={toggle}
        aria-expanded={!collapsed}
        className="mb-2 flex items-baseline gap-2 w-full text-left"
        style={{ background: 'transparent', border: 'none', padding: 0, cursor: 'pointer' }}
      >
        <span
          className="inline-flex items-center justify-center"
          style={{
            width: 14, height: 14, fontSize: 9,
            color: PALETTE.muted,
            transition: 'transform 0.15s ease',
            transform: collapsed ? 'rotate(-90deg)' : 'rotate(0deg)',
          }}
          aria-hidden
        >
          ▼
        </span>
        <h2 className="text-xs font-semibold uppercase tracking-wider" style={{ color: PALETTE.muted }}>
          {label}
        </h2>
        <span className="text-[10px]" style={{ color: PALETTE.muted }}>
          {count} {countLabel}{count === 1 ? '' : 's'}
        </span>
      </button>
      {!collapsed && children}
    </section>
  );
}
