'use client';

/**
 * "My artists" / "All artists" toggle pill.
 *
 * Drives the per-agent default-view filter introduced in Phase 1 of the
 * multi-agent agency rollout. Default is "mine" — each agent sees the
 * bookings + talent assigned to them. Click "All" to see the agency-wide
 * roster (for sick cover, cross-agent coordination, owner oversight).
 *
 * Persistence: the choice rides on the URL (`?scope=mine|all`) AND a
 * cookie. URL wins, cookie is the "sticky last choice" so reloading the
 * page keeps your selection. Same pattern as BookingsViewToggle.
 *
 * Hidden when there's only one active agent — the toggle would do nothing.
 */
import Link from 'next/link';
import { PALETTE } from '@/lib/utils/constants';

type Props = {
  /** Current scope from server resolution. */
  current: 'mine' | 'all';
  /** Cookie key to persist the choice. Different lists use different keys. */
  cookieKey: 'bookings_scope_pref' | 'talent_scope_pref';
  /** Pathname to anchor the links against (e.g. '/bookings'). */
  pathname: string;
  /**
   * Other search params on the current URL that should be preserved when
   * the user clicks. Pass `Object.fromEntries(searchParams)` from the
   * server side, EXCLUDING `scope` itself.
   */
  preserveParams?: Record<string, string>;
};

export default function ScopePill({ current, cookieKey, pathname, preserveParams = {} }: Props) {
  // Set the cookie on click so the choice persists across navigations,
  // not just within this list. Browser-side document.cookie write keeps
  // it dead simple — no server round-trip.
  function setCookie(value: 'mine' | 'all') {
    // eslint-disable-next-line react-hooks/immutability -- writing to document.cookie is the documented way to persist a small preference; not really "modifying state outside a component" in the sense the rule guards against. Same pattern as BookingsViewToggle.
    document.cookie = `${cookieKey}=${value}; path=/; max-age=${60 * 60 * 24 * 30}; samesite=lax`;
  }

  function hrefFor(scope: 'mine' | 'all'): string {
    const params = new URLSearchParams(preserveParams);
    params.set('scope', scope);
    return `${pathname}?${params.toString()}`;
  }

  return (
    <div
      role="group"
      aria-label="Roster scope"
      className="flex gap-1 rounded-md border p-0.5"
      style={{ background: PALETTE.bg, borderColor: PALETTE.border }}
    >
      {(['mine', 'all'] as const).map((scope) => {
        const active = current === scope;
        const label = scope === 'mine' ? 'My artists' : 'All';
        return (
          <Link
            key={scope}
            href={hrefFor(scope)}
            onClick={() => setCookie(scope)}
            className="rounded px-2.5 py-1 text-[11px] font-medium transition-colors"
            style={{
              background: active ? PALETTE.border : 'transparent',
              color: active ? PALETTE.text : PALETTE.muted,
            }}
            aria-pressed={active}
          >
            {label}
          </Link>
        );
      })}
    </div>
  );
}
