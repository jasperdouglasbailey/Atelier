'use client';

/**
 * Global keyboard shortcuts.
 *
 * Two modes:
 *   1. Single-key: `n` (new booking), `i` (inbox), `?` (help)
 *   2. Chord: `g` then a section key (Vim-style "go to") — e.g. `g b` for bookings
 *
 * Shortcuts are ignored when the user is typing in an input/textarea/select
 * or when a modal/dialog is open.
 *
 * Mounted once in the dashboard layout — no per-page wiring needed.
 */

import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { PALETTE } from '@/lib/utils/constants';

const CHORD_TIMEOUT_MS = 1500;

type Shortcut = {
  keys: string;        // human-readable label
  description: string;
  action: () => void;
};

function isTypingInForm(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  const tag = target.tagName.toLowerCase();
  return (
    tag === 'input' ||
    tag === 'textarea' ||
    tag === 'select' ||
    target.isContentEditable
  );
}

export default function KeyboardShortcuts() {
  const router = useRouter();
  const [helpOpen, setHelpOpen] = useState(false);
  const goPrefixActiveRef = useRef(false);
  const goTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Build the shortcut catalogue. Memoised via closure since router is stable.
  const navigate = (path: string) => () => router.push(path);

  const shortcuts: Shortcut[] = [
    { keys: 'g d', description: 'Go to Dashboard', action: navigate('/') },
    { keys: 'g i', description: 'Go to Inbox', action: navigate('/inbox') },
    { keys: 'g b', description: 'Go to Bookings', action: navigate('/bookings') },
    { keys: 'g t', description: 'Go to Talent', action: navigate('/talent') },
    { keys: 'g c', description: 'Go to Crew', action: navigate('/crew') },
    { keys: 'g x', description: 'Go to Crew Bookings', action: navigate('/crew-bookings') },
    { keys: 'g l', description: 'Go to Clients', action: navigate('/clients') },
    { keys: 'g r', description: 'Go to Reports', action: navigate('/reports') },
    { keys: 'g $', description: 'Go to Costs', action: navigate('/costs') },
    { keys: 'g a', description: 'Go to Audit', action: navigate('/audit') },
    { keys: 'g s', description: 'Go to Settings', action: navigate('/settings') },
    { keys: 'n', description: 'New Booking', action: navigate('/bookings/new') },
    { keys: 'i', description: 'Inbox', action: navigate('/inbox') },
    { keys: '?', description: 'Show keyboard shortcuts', action: () => setHelpOpen(true) },
  ];

  useEffect(() => {
    function handler(e: KeyboardEvent) {
      // Bail out for typing contexts
      if (isTypingInForm(e.target)) return;
      // Bail out for modifier-key presses (let browser handle Cmd-K, etc.)
      if (e.metaKey || e.ctrlKey || e.altKey) return;

      const key = e.key.toLowerCase();

      // Help dialog: ? opens, Esc closes
      if (e.key === '?' || (e.shiftKey && e.key === '/')) {
        e.preventDefault();
        setHelpOpen(true);
        return;
      }
      if (e.key === 'Escape' && helpOpen) {
        setHelpOpen(false);
        return;
      }

      // Chord prefix mode
      if (goPrefixActiveRef.current) {
        const target = ({
          d: '/',
          i: '/inbox',
          b: '/bookings',
          t: '/talent',
          c: '/crew',
          x: '/crew-bookings',
          l: '/clients',
          r: '/reports',
          $: '/costs',
          a: '/audit',
          s: '/settings',
        } as Record<string, string>)[key === '4' && e.shiftKey ? '$' : key];
        goPrefixActiveRef.current = false;
        if (goTimerRef.current) {
          clearTimeout(goTimerRef.current);
          goTimerRef.current = null;
        }
        if (target) {
          e.preventDefault();
          router.push(target);
        }
        return;
      }

      // Start chord prefix on plain `g`
      if (key === 'g') {
        e.preventDefault();
        goPrefixActiveRef.current = true;
        if (goTimerRef.current) clearTimeout(goTimerRef.current);
        goTimerRef.current = setTimeout(() => {
          goPrefixActiveRef.current = false;
        }, CHORD_TIMEOUT_MS);
        return;
      }

      // Single-key shortcuts
      if (key === 'n') {
        e.preventDefault();
        router.push('/bookings/new');
      } else if (key === 'i') {
        e.preventDefault();
        router.push('/inbox');
      }
    }

    window.addEventListener('keydown', handler);
    return () => {
      window.removeEventListener('keydown', handler);
      if (goTimerRef.current) clearTimeout(goTimerRef.current);
    };
  }, [router, helpOpen]);

  if (!helpOpen) return null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      className="fixed inset-0 z-50 flex items-center justify-center px-4"
      style={{ background: 'rgba(0,0,0,0.6)' }}
      onClick={() => setHelpOpen(false)}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-md rounded-lg border p-6 shadow-2xl"
        style={{ background: '#141414', borderColor: '#262626', color: PALETTE.text }}
      >
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-base font-semibold">Keyboard shortcuts</h2>
          <button
            onClick={() => setHelpOpen(false)}
            className="text-sm"
            style={{ color: PALETTE.muted }}
            aria-label="Close"
          >
            Esc
          </button>
        </div>
        <ul className="space-y-1.5 text-sm">
          {shortcuts.map((s) => (
            <li key={s.keys} className="flex items-center justify-between">
              <span style={{ color: PALETTE.muted }}>{s.description}</span>
              <kbd
                className="rounded px-2 py-0.5 font-mono text-xs"
                style={{ background: PALETTE.surface, color: PALETTE.text, border: `1px solid ${PALETTE.border}` }}
              >
                {s.keys}
              </kbd>
            </li>
          ))}
        </ul>
        <p className="mt-4 text-[11px]" style={{ color: PALETTE.muted }}>
          Press <kbd className="font-mono">g</kbd> then a key for navigation chords.
        </p>
      </div>
    </div>
  );
}
