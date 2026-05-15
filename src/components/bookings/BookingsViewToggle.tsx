'use client';

/**
 * Bookings view toggle (Calendar / Board / List).
 *
 * Persists the user's choice to a `bookings_view_pref` cookie so the
 * default view follows them across sessions on the same device. The
 * server reads the cookie when no `?view=` is in the URL and routes
 * accordingly.
 *
 * Order is fixed: Calendar → Board → List (left → right). Calendar is
 * the default for new visitors per session 7 doctrine.
 */

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { PALETTE } from '@/lib/utils/constants';

type View = 'calendar' | 'board' | 'list';

const VIEWS: { id: View; label: string; symbol: string; title: string }[] = [
  { id: 'calendar', label: 'Calendar', symbol: '▦', title: 'Calendar view (default)' },
  { id: 'board',    label: 'Board',    symbol: '⊞', title: 'Board view (kanban)' },
  { id: 'list',     label: 'List',     symbol: '≡', title: 'List view (table)' },
];

type Props = {
  current: View;
  /** Hidden URL params to preserve when switching views (group, search, etc.). */
  preserveParams?: Record<string, string | undefined>;
};

export default function BookingsViewToggle({ current, preserveParams = {} }: Props) {
  const router = useRouter();

  function handleClick(view: View) {
    // Persist the choice. 1 year cookie — view preference is sticky.
    // eslint-disable-next-line react-hooks/immutability -- writing to document.cookie is the documented way to persist a small preference; not really "modifying state outside a component" in the sense the rule guards against.
    (document as Document & { cookie: string }).cookie = `bookings_view_pref=${view}; path=/; max-age=${60 * 60 * 24 * 365}; SameSite=Lax`;
    // Bust the Next.js router cache for /bookings so a subsequent visit
    // without ?view= re-runs the server component and picks up the new
    // cookie. Without this, the cached RSC payload for the no-params
    // route can stick around and ignore the cookie — the symptom audit
    // AUDIT-2026-05-15 reported as "cookie not being written".
    router.refresh();
  }

  function buildHref(view: View): string {
    const params = new URLSearchParams();
    params.set('view', view);
    for (const [k, v] of Object.entries(preserveParams)) {
      if (v) params.set(k, v);
    }
    return `/bookings?${params.toString()}`;
  }

  return (
    <>
      {VIEWS.map((v) => {
        const active = current === v.id;
        return (
          <Link
            key={v.id}
            href={buildHref(v.id)}
            onClick={() => handleClick(v.id)}
            className="rounded-md px-3 py-2 text-xs font-medium"
            style={{
              background: active ? PALETTE.border : 'transparent',
              color: active ? PALETTE.text : PALETTE.muted,
            }}
            title={v.title}
          >
            {v.symbol}
          </Link>
        );
      })}
    </>
  );
}
