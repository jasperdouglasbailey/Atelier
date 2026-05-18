'use client';

/**
 * Shoot-lifecycle loader.
 *
 * Replaces the generic "Loading…" placeholder with a small narrated
 * sequence that tells a tiny story while the page boots: setting up
 * lights, slate, rolling, wrap. Loops if loading drags past one cycle.
 *
 * One component, multiple narratives — we pick one at random per mount
 * so the loader has variety across page loads. The text font matches
 * the brand mono (DM Mono) so it reads as part of the UI, not a hack.
 *
 * Animation:
 *   - Each step is shown for 650ms.
 *   - On step change, the new line fades in and shifts up 4px.
 *   - After the last step, we loop back to step 0.
 *   - CSS keyframes only — no React state per frame, no rAF, just an
 *     interval that advances an index. Cheap enough that a hundred of
 *     these on screen wouldn't matter.
 *
 * Accessibility:
 *   - `aria-live="polite"` so screen readers announce changes without
 *     interrupting the user's current focus.
 *   - The first step renders synchronously so SSR + first paint has
 *     content; the cycler only kicks in client-side after hydration.
 */

import { useEffect, useState, useMemo } from 'react';
import { PALETTE } from '@/lib/utils/constants';

type Narrative = { emoji: string; label: string }[];

// Narratives are tiny photo-shoot lifecycles. Keep each step under
// ~22 chars so the loader doesn't wrap on narrow screens.
const NARRATIVES: Narrative[] = [
  // The "running a shoot" story
  [
    { emoji: '📷', label: 'Setting up…' },
    { emoji: '💡', label: 'Adjusting lights…' },
    { emoji: '🎬', label: 'Slate ready…' },
    { emoji: '🎞️', label: 'Rolling…' },
    { emoji: '✨', label: 'Almost there…' },
  ],
  // The "agency back-office" story
  [
    { emoji: '☕', label: 'Brewing coffee…' },
    { emoji: '📋', label: 'Reading the brief…' },
    { emoji: '🤝', label: 'Booking the team…' },
    { emoji: '💸', label: 'Crunching numbers…' },
    { emoji: '📤', label: 'Sending it…' },
  ],
  // The "post-production" story
  [
    { emoji: '📁', label: 'Loading the cards…' },
    { emoji: '🎨', label: 'Grading the colour…' },
    { emoji: '🪄', label: 'Retouching…' },
    { emoji: '🖼️', label: 'Bagging the selects…' },
    { emoji: '🚀', label: 'Sending to client…' },
  ],
  // The "talent vibe" story
  [
    { emoji: '👋', label: 'Saying hello…' },
    { emoji: '☎️', label: 'On a call…' },
    { emoji: '📅', label: 'Checking the diary…' },
    { emoji: '✍️', label: 'Penciling it in…' },
    { emoji: '🥂', label: 'Locked in!' },
  ],
];

function pickNarrative(): Narrative {
  // SSR-safe random — Math.random returns the same on every render in a
  // pure component, but this only runs client-side (the loader is a
  // 'use client' component and the parent renders a skeleton during SSR).
  return NARRATIVES[Math.floor(Math.random() * NARRATIVES.length)];
}

const STEP_MS = 650;

export default function ShootLifecycleLoader({ subtitle }: { subtitle?: string }) {
  const narrative = useMemo(pickNarrative, []);
  const [index, setIndex] = useState(0);

  useEffect(() => {
    const id = setInterval(() => {
      setIndex((i) => (i + 1) % narrative.length);
    }, STEP_MS);
    return () => clearInterval(id);
  }, [narrative.length]);

  const step = narrative[index];

  return (
    <div
      className="flex items-center justify-center gap-3 py-6"
      aria-live="polite"
      aria-label="Loading"
    >
      <span
        // Re-keyed on index so React remounts the spans → CSS opacity
        // animation runs fresh on each step transition.
        key={`emoji-${index}`}
        style={{
          fontSize: 22,
          lineHeight: 1,
          animation: 'atelier-loader-fade 350ms ease-out both',
        }}
      >
        {step.emoji}
      </span>
      <span
        key={`label-${index}`}
        style={{
          fontFamily: 'var(--font-dm-mono), ui-monospace, monospace',
          fontSize: 12,
          color: PALETTE.muted,
          letterSpacing: '0.04em',
          animation: 'atelier-loader-fade 350ms ease-out both',
        }}
      >
        {step.label}
      </span>
      {subtitle && (
        <span style={{ color: PALETTE.muted, opacity: 0.5, fontSize: 11 }}>
          · {subtitle}
        </span>
      )}
      <style>{`
        @keyframes atelier-loader-fade {
          from { opacity: 0; transform: translateY(4px); }
          to   { opacity: 1; transform: translateY(0);    }
        }
        @media (prefers-reduced-motion: reduce) {
          [aria-label="Loading"] span { animation: none !important; }
        }
      `}</style>
    </div>
  );
}
