'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import type { CalendarShoot } from '@/lib/data/crew-bookings';
import { PALETTE, STATE_COLORS, BOOKING_STATE_LABELS } from '@/lib/utils/constants';
import type { BookingState } from '@/lib/types/database';

type Props = { shoots: CalendarShoot[] };

const DAY_LABELS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

// Layout constants (px)
const DAY_NUM_H = 28; // height of the date-number row per cell
const BAR_H = 22;     // height of each event lane
const ROW_PAD = 6;    // bottom breathing room

type ShootBar = {
  shoot: CalendarShoot;
  startCol: number; // 0-6 within this week
  span: number;     // 1-7 columns
  lane: number;     // vertical stacking lane
};

function ymd(d: Date) {
  return d.toISOString().slice(0, 10);
}

function startOfMonth(year: number, month0: number) {
  return new Date(Date.UTC(year, month0, 1));
}

/** 6 × 7 grid of dates covering the month, starting from the Monday before the 1st. */
function buildGrid(year: number, month0: number): Date[] {
  const first = startOfMonth(year, month0);
  const dow = (first.getUTCDay() + 6) % 7; // Mon=0 … Sun=6
  const gridStart = new Date(first);
  gridStart.setUTCDate(first.getUTCDate() - dow);
  return Array.from({ length: 42 }, (_, i) => {
    const d = new Date(gridStart);
    d.setUTCDate(gridStart.getUTCDate() + i);
    return d;
  });
}

/** Day-offset between two UTC dates (may be negative). */
function daysBetween(a: Date, b: Date) {
  return Math.round((b.getTime() - a.getTime()) / (24 * 60 * 60 * 1000));
}

/**
 * For a given week row, find shoots that overlap and assign them to
 * non-overlapping vertical lanes. Returns bars ready for rendering.
 */
function computeWeekBars(weekDays: Date[], shoots: CalendarShoot[]): ShootBar[] {
  const weekStart = weekDays[0];
  const weekEnd = weekDays[6];

  const overlapping = shoots.filter((s) => {
    const sStart = new Date(s.start + 'T00:00:00Z');
    const sEnd = new Date(s.end + 'T00:00:00Z');
    return sStart.getTime() <= weekEnd.getTime() && sEnd.getTime() >= weekStart.getTime();
  });

  // Sort by actual start so earlier shoots get lower lanes
  overlapping.sort(
    (a, b) => new Date(a.start + 'T00:00:00Z').getTime() - new Date(b.start + 'T00:00:00Z').getTime(),
  );

  const bars: ShootBar[] = [];
  // laneEnds[i] = last column occupied in lane i for the current week
  const laneEnds: number[] = [];

  for (const shoot of overlapping) {
    const sStart = new Date(shoot.start + 'T00:00:00Z');
    const sEnd = new Date(shoot.end + 'T00:00:00Z');

    const startCol = Math.max(0, daysBetween(weekStart, sStart));
    const endCol = Math.min(6, daysBetween(weekStart, sEnd));
    const span = Math.max(1, endCol - startCol + 1);

    // Greedy lane assignment — find first lane where endCol doesn't overlap
    let lane = 0;
    while (lane < laneEnds.length && laneEnds[lane] >= startCol) {
      lane++;
    }
    laneEnds[lane] = endCol;

    bars.push({ shoot, startCol, span, lane });
  }

  return bars;
}

export default function CrewCalendar({ shoots }: Props) {
  const today = new Date();
  const [cursor, setCursor] = useState<{ year: number; month0: number }>({
    year: today.getUTCFullYear(),
    month0: today.getUTCMonth(),
  });

  const grid = useMemo(() => buildGrid(cursor.year, cursor.month0), [cursor]);
  const weeks = useMemo(
    () => Array.from({ length: 6 }, (_, i) => grid.slice(i * 7, i * 7 + 7)),
    [grid],
  );

  const todayKey = ymd(
    new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate())),
  );

  const monthLabel = new Date(Date.UTC(cursor.year, cursor.month0, 1)).toLocaleDateString('en-AU', {
    month: 'long',
    year: 'numeric',
    timeZone: 'UTC',
  });

  const prev = () =>
    setCursor((c) => (c.month0 === 0 ? { year: c.year - 1, month0: 11 } : { year: c.year, month0: c.month0 - 1 }));
  const next = () =>
    setCursor((c) => (c.month0 === 11 ? { year: c.year + 1, month0: 0 } : { year: c.year, month0: c.month0 + 1 }));
  const jumpToday = () => {
    const t = new Date();
    setCursor({ year: t.getUTCFullYear(), month0: t.getUTCMonth() });
  };

  return (
    <div>
      {/* Header */}
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
        <div className="grid grid-cols-7 border-b" style={{ borderColor: PALETTE.border, background: PALETTE.bg }}>
          {DAY_LABELS.map((label) => (
            <div
              key={label}
              className="px-3 py-2 text-[10px] font-semibold uppercase tracking-wider"
              style={{ color: PALETTE.muted }}
            >
              {label}
            </div>
          ))}
        </div>

        {/* 6 week rows */}
        {weeks.map((weekDays, weekIdx) => {
          const bars = computeWeekBars(weekDays, shoots);
          const numLanes = bars.length > 0 ? Math.max(...bars.map((b) => b.lane)) + 1 : 0;
          const rowMinHeight = DAY_NUM_H + numLanes * BAR_H + ROW_PAD;

          return (
            <div
              key={weekIdx}
              className="relative grid grid-cols-7 border-b"
              style={{ borderColor: PALETTE.border, minHeight: rowMinHeight }}
            >
              {/* Day number cells — provide grid structure and column dividers */}
              {weekDays.map((date, colIdx) => {
                const inMonth = date.getUTCMonth() === cursor.month0;
                const isToday = ymd(date) === todayKey;
                return (
                  <div
                    key={colIdx}
                    className={colIdx < 6 ? 'border-r' : ''}
                    style={{
                      borderColor: PALETTE.border,
                      background: inMonth ? 'transparent' : `${PALETTE.bg}cc`,
                    }}
                  >
                    <div
                      className="flex items-baseline justify-between px-1.5 pt-1.5"
                      style={{ height: DAY_NUM_H }}
                    >
                      <span
                        className="text-[11px] font-medium"
                        style={{
                          color: isToday
                            ? PALETTE.accent
                            : inMonth
                            ? PALETTE.muted
                            : '#404560',
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
                  </div>
                );
              })}

              {/* Event bars — absolutely positioned below the date-number row */}
              {bars.map(({ shoot, startCol, span, lane }) => {
                const color =
                  STATE_COLORS[shoot.state as BookingState] ?? PALETTE.accent;
                const crewNames = shoot.crew.map((c) => c.name).join(', ');
                const isStart = new Date(shoot.start + 'T00:00:00Z').getTime() >=
                  weekDays[startCol]?.getTime();
                // Bar starts at the left edge of startCol, spans 'span' columns
                const leftPct = (startCol / 7) * 100;
                const widthPct = (span / 7) * 100;
                const top = DAY_NUM_H + lane * BAR_H + 2;
                const height = BAR_H - 4;

                return (
                  <Link
                    key={`${shoot.bookingId}-${weekIdx}`}
                    href={`/bookings/${shoot.bookingId}`}
                    onClick={(e) => e.stopPropagation()}
                    title={[
                      `${shoot.bookingRef ?? shoot.title}`,
                      BOOKING_STATE_LABELS[shoot.state as BookingState] ?? shoot.state,
                      crewNames || 'No crew assigned',
                    ].join(' · ')}
                    className="absolute flex items-center overflow-hidden transition-opacity hover:opacity-80"
                    style={{
                      left: `calc(${leftPct}% + ${isStart ? 4 : 0}px)`,
                      width: `calc(${widthPct}% - ${isStart ? 8 : 4}px)`,
                      top,
                      height,
                      lineHeight: `${height}px`,
                      borderRadius: isStart ? 3 : 0,
                      borderTopLeftRadius: isStart ? 3 : 0,
                      borderBottomLeftRadius: isStart ? 3 : 0,
                      borderTopRightRadius: 3,
                      borderBottomRightRadius: 3,
                      background: `${color}22`,
                      color,
                      borderLeft: isStart ? `2px solid ${color}` : 'none',
                      paddingLeft: 6,
                      paddingRight: 4,
                    }}
                  >
                    <span className="truncate text-[10px] font-medium">
                      {isStart ? (shoot.bookingRef ?? shoot.title) : ''}
                    </span>
                    {crewNames && isStart && (
                      <span
                        className="ml-1.5 truncate text-[9px] hidden sm:block"
                        style={{ color: `${color}aa` }}
                      >
                        {crewNames}
                      </span>
                    )}
                  </Link>
                );
              })}
            </div>
          );
        })}
      </div>

      {/* Legend */}
      <div className="mt-3 flex flex-wrap items-center gap-4 text-[10px]" style={{ color: PALETTE.muted }}>
        <span>Click a shoot to open the booking. Hover for crew details.</span>
        {shoots.length > 0 && (
          <span>
            Multi-day shoots span across cells.
          </span>
        )}
      </div>
    </div>
  );
}
