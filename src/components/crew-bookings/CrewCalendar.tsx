'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import type { CalendarShoot } from '@/lib/data/crew-bookings';
import { PALETTE, STATE_COLORS, BOOKING_STATE_LABELS } from '@/lib/utils/constants';
import type { BookingState } from '@/lib/types/database';

type Props = { shoots: CalendarShoot[] };

const DAY_LABELS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

function startOfMonth(year: number, month0: number) {
  return new Date(Date.UTC(year, month0, 1));
}

function ymd(d: Date) {
  return d.toISOString().slice(0, 10);
}

/**
 * Returns a 6-row × 7-col grid of dates covering the requested month.
 * First row starts on the Monday on or before the 1st.
 */
function buildGrid(year: number, month0: number): Date[] {
  const first = startOfMonth(year, month0);
  // Shift back to Monday (getUTCDay: 0=Sun..6=Sat — we want Monday=0)
  const dow = (first.getUTCDay() + 6) % 7;
  const gridStart = new Date(first);
  gridStart.setUTCDate(first.getUTCDate() - dow);

  const cells: Date[] = [];
  for (let i = 0; i < 42; i++) {
    const d = new Date(gridStart);
    d.setUTCDate(gridStart.getUTCDate() + i);
    cells.push(d);
  }
  return cells;
}

export default function CrewCalendar({ shoots }: Props) {
  const today = new Date();
  const [cursor, setCursor] = useState<{ year: number; month0: number }>({
    year: today.getUTCFullYear(),
    month0: today.getUTCMonth(),
  });

  const grid = useMemo(() => buildGrid(cursor.year, cursor.month0), [cursor]);

  // Map ymd -> shoots that fall on that day (start through end inclusive)
  const byDay = useMemo(() => {
    const m = new Map<string, CalendarShoot[]>();
    for (const s of shoots) {
      const start = new Date(s.start + 'T00:00:00Z');
      const end = new Date(s.end + 'T00:00:00Z');
      for (let d = new Date(start); d.getTime() <= end.getTime(); d.setUTCDate(d.getUTCDate() + 1)) {
        const key = ymd(d);
        if (!m.has(key)) m.set(key, []);
        m.get(key)!.push(s);
      }
    }
    return m;
  }, [shoots]);

  const monthLabel = new Date(Date.UTC(cursor.year, cursor.month0, 1)).toLocaleDateString('en-AU', {
    month: 'long',
    year: 'numeric',
    timeZone: 'UTC',
  });

  const todayKey = ymd(new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate())));

  const prev = () => {
    setCursor((c) => {
      const m = c.month0 - 1;
      if (m < 0) return { year: c.year - 1, month0: 11 };
      return { year: c.year, month0: m };
    });
  };
  const next = () => {
    setCursor((c) => {
      const m = c.month0 + 1;
      if (m > 11) return { year: c.year + 1, month0: 0 };
      return { year: c.year, month0: m };
    });
  };
  const jumpToday = () => {
    const t = new Date();
    setCursor({ year: t.getUTCFullYear(), month0: t.getUTCMonth() });
  };

  return (
    <div>
      <header className="mb-3 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <button
            onClick={prev}
            className="rounded-md border px-3 py-1.5 text-xs"
            style={{ borderColor: PALETTE.border, color: PALETTE.text }}
            aria-label="Previous month"
          >
            ←
          </button>
          <button
            onClick={jumpToday}
            className="rounded-md border px-3 py-1.5 text-xs"
            style={{ borderColor: PALETTE.border, color: PALETTE.muted }}
          >
            Today
          </button>
          <button
            onClick={next}
            className="rounded-md border px-3 py-1.5 text-xs"
            style={{ borderColor: PALETTE.border, color: PALETTE.text }}
            aria-label="Next month"
          >
            →
          </button>
        </div>
        <h2 className="text-sm font-semibold" style={{ color: PALETTE.text }}>
          {monthLabel}
        </h2>
        <span className="text-xs" style={{ color: PALETTE.muted }}>
          {shoots.length} shoot{shoots.length === 1 ? '' : 's'}
        </span>
      </header>

      <div
        className="overflow-hidden rounded-lg border"
        style={{ background: PALETTE.surface, borderColor: PALETTE.border }}
      >
        {/* Day-of-week header */}
        <div className="grid grid-cols-7 border-b" style={{ borderColor: PALETTE.border }}>
          {DAY_LABELS.map((label) => (
            <div
              key={label}
              className="px-3 py-2 text-[10px] font-semibold uppercase tracking-wider"
              style={{ color: PALETTE.muted, background: PALETTE.bg }}
            >
              {label}
            </div>
          ))}
        </div>

        {/* 6 rows × 7 cols */}
        <div className="grid grid-cols-7 grid-rows-6">
          {grid.map((date, idx) => {
            const key = ymd(date);
            const inMonth = date.getUTCMonth() === cursor.month0;
            const isToday = key === todayKey;
            const dayShoots = byDay.get(key) ?? [];
            return (
              <div
                key={idx}
                className="min-h-[88px] border-r border-b p-1.5"
                style={{
                  borderColor: PALETTE.border,
                  background: inMonth ? 'transparent' : PALETTE.bg,
                  opacity: inMonth ? 1 : 0.5,
                }}
              >
                <div className="mb-1 flex items-baseline justify-between">
                  <span
                    className="text-[11px] font-medium"
                    style={{
                      color: isToday ? PALETTE.accent : PALETTE.muted,
                    }}
                  >
                    {date.getUTCDate()}
                  </span>
                  {isToday && (
                    <span
                      className="rounded-full px-1.5 py-0.5 text-[9px] font-semibold uppercase"
                      style={{ background: `${PALETTE.accent}33`, color: PALETTE.accent }}
                    >
                      Today
                    </span>
                  )}
                </div>
                <div className="space-y-1">
                  {dayShoots.slice(0, 3).map((s) => (
                    <Link
                      key={s.bookingId}
                      href={`/bookings/${s.bookingId}`}
                      title={`${s.bookingRef ?? ''} · ${s.title} · ${BOOKING_STATE_LABELS[s.state as BookingState] ?? s.state}\n${s.crew.map((c) => c.name).join(', ') || 'No crew assigned'}`}
                      className="block truncate rounded px-1.5 py-0.5 text-[10px] font-medium leading-tight transition-opacity hover:opacity-80"
                      style={{
                        background: `${STATE_COLORS[s.state as BookingState] ?? PALETTE.accent}22`,
                        color: STATE_COLORS[s.state as BookingState] ?? PALETTE.accent,
                        borderLeft: `2px solid ${STATE_COLORS[s.state as BookingState] ?? PALETTE.accent}`,
                      }}
                    >
                      {s.bookingRef ?? s.title}
                    </Link>
                  ))}
                  {dayShoots.length > 3 && (
                    <div className="text-[9px]" style={{ color: PALETTE.muted }}>
                      +{dayShoots.length - 3} more
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Legend */}
      <div className="mt-3 flex flex-wrap gap-3 text-[10px]" style={{ color: PALETTE.muted }}>
        <span>Click a shoot to open the booking. Hover to see crew.</span>
      </div>
    </div>
  );
}
