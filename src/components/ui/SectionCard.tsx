import Link from 'next/link';
import { PALETTE } from '@/lib/utils/constants';
import type { ReactNode } from 'react';

// Shared section card — title + optional action link + body. Used across
// overview pages to keep all content sections visually consistent.
// Tighter than the previous `<section class="rounded-lg border p-5">`
// pattern (uses p-4) so vertical density rises ~25%.

export type SectionCardProps = {
  title: string;
  /** Optional small badge after the title (e.g. count). */
  meta?: ReactNode;
  /** Optional right-side action link. Renders as muted text with → arrow. */
  action?: { label: string; href: string };
  /** Compact mode — drop padding to p-3 and use small section-title styling. */
  compact?: boolean;
  /** Override padding entirely. */
  className?: string;
  children: ReactNode;
};

export default function SectionCard({ title, meta, action, compact = false, className, children }: SectionCardProps) {
  // When the caller passes h-full (i.e. wants the card to stretch in a grid row),
  // switch to flex-column so the body fills the remaining height beneath the header.
  // Otherwise stay with the default block layout that auto-sizes to content.
  const wantsStretch = (className ?? '').includes('h-full');
  return (
    <section
      className={`rounded-lg border ${compact ? 'p-3' : 'p-4'} ${wantsStretch ? 'flex flex-col' : ''} ${className ?? ''}`}
      style={{ background: PALETTE.surface, borderColor: PALETTE.border }}
    >
      <div className="mb-3 flex items-baseline justify-between gap-3">
        <div className="flex items-baseline gap-2">
          <h2
            className="text-[11px] font-semibold uppercase tracking-wider"
            style={{ color: PALETTE.muted }}
          >
            {title}
          </h2>
          {meta && (
            <span className="text-[11px]" style={{ color: PALETTE.muted }}>{meta}</span>
          )}
        </div>
        {action && (
          <Link href={action.href} className="text-[11px]" style={{ color: PALETTE.accent }}>
            {action.label} →
          </Link>
        )}
      </div>
      {wantsStretch ? <div className="flex-1 min-h-0">{children}</div> : children}
    </section>
  );
}
