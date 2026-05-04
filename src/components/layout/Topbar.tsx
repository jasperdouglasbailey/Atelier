'use client';

import Link from 'next/link';
import { useEffect, useState, useTransition } from 'react';
import { usePathname } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import type { KillSwitchState } from '@/lib/utils/kill-switch';
import { toggleKillSwitchAction } from '@/app/actions/kill-switch';

type Props = {
  title: string;
  initialKillSwitch?: KillSwitchState | null;
  /** Override auto-inferred back link. Useful when the parent isn't the URL parent. */
  backHref?: string;
  backLabel?: string;
};

const SECTION_LABELS: Record<string, string> = {
  bookings: 'Bookings',
  talent: 'Talent',
  crew: 'Crew',
  clients: 'Clients',
  inbox: 'Inbox',
  reports: 'Reports',
  costs: 'Costs',
  audit: 'Audit',
  settings: 'Settings',
  'crew-bookings': 'Crew Bookings',
};

/**
 * Derive a deterministic back link from the URL. Always points to the
 * parent listing — works even when the user arrived via a deep link
 * (browser back would fail in that case).
 */
function inferBackLink(pathname: string): { href: string; label: string } | null {
  const segments = pathname.split('/').filter(Boolean);
  if (segments.length < 2) return null;

  // /bookings/[id] → /bookings ("Bookings")
  // /talent/[id] → /talent ("Talent")
  if (segments.length === 2) {
    const parent = segments[0];
    return { href: `/${parent}`, label: SECTION_LABELS[parent] ?? parent };
  }

  // /bookings/[id]/edit → /bookings/[id] ("Booking")
  // /talent/[id]/edit → /talent/[id] ("Talent profile")
  if (segments.length === 3 && segments[2] === 'edit') {
    const sectionLabel = SECTION_LABELS[segments[0]] ?? segments[0];
    return { href: `/${segments[0]}/${segments[1]}`, label: sectionLabel.replace(/s$/, '') };
  }

  // /crew-bookings/calendar → /crew-bookings ("Crew Bookings")
  if (segments[0] === 'crew-bookings' && segments[1] === 'calendar') {
    return { href: '/crew-bookings', label: 'Crew Bookings' };
  }

  return null;
}

export default function Topbar({ title, initialKillSwitch = null, backHref, backLabel }: Props) {
  const pathname = usePathname();
  const inferred = inferBackLink(pathname);
  const back = backHref && backLabel
    ? { href: backHref, label: backLabel }
    : inferred;
  const [state, setState] = useState<KillSwitchState | null>(initialKillSwitch);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [isPending, startTransition] = useTransition();

  useEffect(() => {
    const supabase = createClient();
    let cancelled = false;

    // Hydrate from DB on mount when no SSR state was provided
    if (!initialKillSwitch) {
      supabase
        .from('atelier_kill_switch')
        .select('*')
        .limit(1)
        .maybeSingle()
        .then(({ data }) => {
          if (!cancelled && data) setState(data as KillSwitchState);
        });
    }

    const channel = supabase
      .channel('topbar_kill_switch')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'atelier_kill_switch' },
        (payload) => {
          if (payload.eventType === 'DELETE') setState(null);
          else if (payload.new) setState(payload.new as KillSwitchState);
        },
      )
      .subscribe();
    return () => {
      cancelled = true;
      supabase.removeChannel(channel);
    };
  }, [initialKillSwitch]);

  const isActive = state?.is_active ?? false;
  const isPaused = state?.pause_outbound ?? false;

  const togglePauseOutbound = () => {
    startTransition(async () => {
      await toggleKillSwitchAction('pause_outbound');
    });
  };

  const confirmKillSwitch = () => {
    setConfirmOpen(false);
    startTransition(async () => {
      await toggleKillSwitchAction('is_active');
    });
  };

  return (
    <>
      <header
        className="flex h-14 items-center gap-3 border-b px-4 sm:px-6"
        style={{ background: '#141414', borderColor: '#262626' }}
      >
        {back && (
          <Link
            href={back.href}
            className="flex items-center gap-1 rounded-md px-2 py-1 text-xs font-medium transition-colors hover:bg-white/5"
            style={{ color: '#8b8b8b' }}
          >
            <span aria-hidden>←</span>
            <span>{back.label}</span>
          </Link>
        )}
        <h1 className="flex-1 truncate text-sm font-medium" style={{ color: '#ededed' }}>
          {title}
        </h1>

        <button
          onClick={togglePauseOutbound}
          disabled={isPending}
          className="hidden rounded-md border px-3 py-1.5 text-xs font-medium transition-colors disabled:opacity-50 sm:inline-flex"
          style={{
            borderColor: isPaused ? '#fbbf24' : '#262626',
            color: isPaused ? '#fbbf24' : '#8b8b8b',
            background: isPaused ? '#3d2e0f' : 'transparent',
          }}
          aria-pressed={isPaused}
        >
          {isPaused ? 'Outbound paused' : 'Pause outbound'}
        </button>

        <button
          onClick={() => setConfirmOpen(true)}
          disabled={isPending}
          className="rounded-md px-3 py-1.5 text-xs font-semibold uppercase tracking-wide transition-colors disabled:opacity-50"
          style={{
            background: isActive ? '#7f1d1d' : 'transparent',
            color: isActive ? '#fff' : '#f87171',
            border: `1px solid ${isActive ? '#7f1d1d' : '#5c2626'}`,
          }}
          aria-pressed={isActive}
        >
          {isActive ? 'Kill switch on' : 'Kill switch'}
        </button>
      </header>

      {/* Mobile-only pause-outbound row, since we hide it from the header above */}
      <div className="flex border-b px-4 py-2 sm:hidden" style={{ background: '#141414', borderColor: '#262626' }}>
        <button
          onClick={togglePauseOutbound}
          disabled={isPending}
          className="w-full rounded-md border px-3 py-2 text-xs font-medium transition-colors disabled:opacity-50"
          style={{
            borderColor: isPaused ? '#fbbf24' : '#262626',
            color: isPaused ? '#fbbf24' : '#8b8b8b',
            background: isPaused ? '#3d2e0f' : 'transparent',
          }}
        >
          {isPaused ? 'Outbound paused — tap to resume' : 'Pause outbound'}
        </button>
      </div>

      {confirmOpen && (
        <div
          role="dialog"
          aria-modal="true"
          className="fixed inset-0 z-50 flex items-center justify-center px-4"
          style={{ background: 'rgba(0,0,0,0.6)' }}
          onClick={() => setConfirmOpen(false)}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="w-full max-w-md rounded-lg border p-6 shadow-2xl"
            style={{ background: '#141414', borderColor: '#262626', color: '#ededed' }}
          >
            <h2 className="mb-2 text-base font-semibold">
              {isActive ? 'Disable kill switch?' : 'Enable kill switch?'}
            </h2>
            <p className="mb-5 text-sm" style={{ color: '#8b8b8b' }}>
              {isActive
                ? 'Agents will resume processing and outbound sends will be allowed (subject to the pause-outbound flag).'
                : 'Are you sure? This will freeze ALL agent activity. Drafts will not be generated and nothing will send externally.'}
            </p>
            <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
              <button
                onClick={() => setConfirmOpen(false)}
                className="rounded-md border px-4 py-2 text-sm"
                style={{ borderColor: '#262626', color: '#8b8b8b' }}
              >
                Cancel
              </button>
              <button
                onClick={confirmKillSwitch}
                className="rounded-md px-4 py-2 text-sm font-semibold"
                style={{ background: isActive ? '#262626' : '#7f1d1d', color: '#fff' }}
              >
                {isActive ? 'Disable kill switch' : 'Enable kill switch'}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
