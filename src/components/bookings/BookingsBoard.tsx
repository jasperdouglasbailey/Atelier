'use client';

import Link from 'next/link';
import type { BookingListRow } from '@/lib/data/bookings';
import type { BookingState } from '@/lib/types/database';
import { BOOKING_STATE_LABELS, STATE_COLORS, SHOOT_TIER_LABELS, ACTIVE_STATES, PALETTE } from '@/lib/utils/constants';
import { formatCurrency } from '@/lib/utils/format';

type Props = { bookings: BookingListRow[] };

export default function BookingsBoard({ bookings }: Props) {
  // Group by state, only include states that have bookings (preserve pipeline order)
  const grouped = ACTIVE_STATES.reduce<Record<string, BookingListRow[]>>((acc, state) => {
    const rows = bookings.filter((b) => b.state === state);
    if (rows.length > 0) acc[state] = rows;
    return acc;
  }, {});

  const columns = Object.entries(grouped) as [BookingState, BookingListRow[]][];

  if (columns.length === 0) {
    return (
      <div className="flex items-center justify-center py-24 text-sm" style={{ color: PALETTE.muted }}>
        No active bookings.{' '}
        <Link href="/bookings/new" className="ml-2 underline" style={{ color: PALETTE.accent }}>
          Create one.
        </Link>
      </div>
    );
  }

  return (
    <div className="flex gap-3 overflow-x-auto pb-4" style={{ minHeight: 400 }}>
      {columns.map(([state, rows]) => {
        const color = STATE_COLORS[state];
        const columnTotal = rows.reduce((s, b) => s + (b.grand_total ?? 0), 0);
        return (
          <div key={state} className="flex-shrink-0 w-64 flex flex-col gap-2">
            {/* Column header */}
            <div
              className="rounded-lg px-3 py-2 flex items-center justify-between"
              style={{ background: `${color}18`, border: `1px solid ${color}33` }}
            >
              <div>
                <div className="text-[10px] font-bold uppercase tracking-wider" style={{ color }}>
                  {BOOKING_STATE_LABELS[state]}
                </div>
                <div className="text-[10px] mt-0.5" style={{ color: PALETTE.muted }}>
                  {rows.length} booking{rows.length !== 1 ? 's' : ''}
                  {columnTotal > 0 && ` · ${formatCurrency(columnTotal)}`}
                </div>
              </div>
              <div
                className="rounded-full w-5 h-5 flex items-center justify-center text-[10px] font-bold flex-shrink-0"
                style={{ background: color, color: '#000' }}
              >
                {rows.length}
              </div>
            </div>

            {/* Cards */}
            <div className="flex flex-col gap-2">
              {rows.map((b) => {
                const clientName = b.client?.company || b.client?.name || null;
                return (
                  <Link
                    key={b.id}
                    href={`/bookings/${b.id}`}
                    className="block rounded-lg border p-3 transition-all hover:border-opacity-60"
                    style={{ background: PALETTE.surface, borderColor: PALETTE.border }}
                  >
                    <div className="flex items-start justify-between gap-1 mb-1">
                      <span className="font-mono text-[10px]" style={{ color: PALETTE.accent }}>
                        {b.booking_ref ?? '—'}
                      </span>
                      <span
                        className="text-[9px] rounded px-1.5 py-0.5 flex-shrink-0"
                        style={{ background: PALETTE.bg, color: PALETTE.muted }}
                      >
                        {SHOOT_TIER_LABELS[b.tier]}
                      </span>
                    </div>
                    <div className="text-xs font-medium leading-tight mb-1" style={{ color: PALETTE.text }}>
                      {b.title}
                    </div>
                    {(() => {
                      const primaryArtist = b.booking_talent?.[0]?.talent;
                      return primaryArtist ? (
                        <div className="text-[10px] mb-0.5" style={{ color: PALETTE.accent }}>
                          {primaryArtist.name}
                          {primaryArtist.discipline && (
                            <span className="ml-1" style={{ color: PALETTE.muted }}>· {primaryArtist.discipline}</span>
                          )}
                        </div>
                      ) : null;
                    })()}
                    {clientName && (
                      <div className="text-[10px]" style={{ color: PALETTE.muted }}>
                        {clientName}
                      </div>
                    )}
                    {(b.grand_total ?? 0) > 0 && (
                      <div className="mt-2 text-xs font-semibold tabular-nums" style={{ color: PALETTE.text }}>
                        {formatCurrency(b.grand_total, 'AUD')}
                      </div>
                    )}
                  </Link>
                );
              })}
            </div>
          </div>
        );
      })}
    </div>
  );
}
