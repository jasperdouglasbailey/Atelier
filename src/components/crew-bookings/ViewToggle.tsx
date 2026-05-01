'use client';

import Link from 'next/link';
import { PALETTE } from '@/lib/utils/constants';

type Props = { active: 'list' | 'calendar' };

export default function ViewToggle({ active }: Props) {
  const baseStyle = {
    borderColor: PALETTE.border,
    background: 'transparent',
    color: PALETTE.muted,
  } as const;
  const activeStyle = {
    borderColor: PALETTE.accent,
    background: `${PALETTE.accent}22`,
    color: PALETTE.accent,
  } as const;

  return (
    <div className="inline-flex rounded-md border p-0.5" style={{ borderColor: PALETTE.border }}>
      <Link
        href="/crew-bookings"
        className="rounded px-3 py-1 text-xs font-medium transition-colors"
        style={active === 'list' ? activeStyle : baseStyle}
      >
        List
      </Link>
      <Link
        href="/crew-bookings/calendar"
        className="rounded px-3 py-1 text-xs font-medium transition-colors"
        style={active === 'calendar' ? activeStyle : baseStyle}
      >
        Calendar
      </Link>
    </div>
  );
}
