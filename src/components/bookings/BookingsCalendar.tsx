'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import type { CalendarShoot } from '@/lib/data/crew-bookings';
import type { BookingRoster } from '@/lib/data/booking-roster';
import { PALETTE, STATE_COLORS } from '@/lib/utils/constants';
import type { BookingState } from '@/lib/types/database';
import { formatBookingTitle } from '@/lib/utils/booking-title';
import BookingHoverCard from './BookingHoverCard';

type Props = {
  shoots: CalendarShoot[];
  /** Booking ID → full talent + crew roster, used for the hover card. */
  rosterByBookingId: Record<string, BookingRoster>;
};

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

/**
 * Relative luminance of a `#rrggbb` colour (0–1). Used to decide whether
 * dark or light text reads better on top of the colour.
 */
function stateLuma(hex: string): number {
  const m = hex.match(/^#?([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i);
  if (!m) return 0.5;
  const r = parseInt(m[1], 16) / 255;
  const g = parseInt(m[2], 16) / 255;
  const b = parseInt(m[3], 16) / 255;
  // Perceptual luminance via the rec. 709 coefficients
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

/** Darken a `#rrggbb` colour by `amount` (0–1) — used for bar borders. */
function darken(hex: string, amount: number): string {
  const m = hex.match(/^#?([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i);
  if (!m) return hex;
  const adjust = (channel: string) =>
    Math.max(0, Math.round(parseInt(channel, 16) * (1 - amount)))
      .toString(16)
      .padStart(2, '0');
  return `#${adjust(m[1])}${adjust(m[2])}${adjust(m[3])}`;
}

/**
 * State-group → representative colour, used for the calendar legend.
 * Maps the 13 booking states down to 5 narrative groups so the legend
 * stays scannable: Brief → Quote → Production → Finance → Closed.
 */
const LEGEND_GROUPS: Array<{ label: string; states: BookingState[]; color: string }> = [
  { label: 'Brief', states: ['brief_received', 'brief_parsed'], color: STATE_COLORS.brief_received },
  { label: 'Quote', states: ['quote_drafted', 'quote_sent', 'artists_crew_held', 'quote_confirmed'], color: STATE_COLORS.quote_sent },
  { label: 'Production', states: ['pre_production', 'shoot_live', 'morning_after_check', 'post_production', 'final_delivery'], color: STATE_COLORS.shoot_live },
  { label: 'Finance', states: ['invoice_issued', 'paid'], color: STATE_COLORS.invoice_issued },
  { label: 'Closed', states: ['released', 'cancelled'], color: STATE_COLORS.released },
];

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

/**
 * Month-grid calendar of bookings. Each shoot is a coloured bar showing the
 * booking ref, state, and any attached crew. Clicking a bar opens that
 * booking's detail page. Used by /bookings?view=calendar.
 */
export default function BookingsCalendar({ shoots, rosterByBookingId }: Props) {
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
        className="overflow-hidden rounded-lg border flex flex-col"
        style={{
          background: PALETTE.surface,
          borderColor: PALETTE.border,
          // Fill the viewport minus the topbar / toolbar / month nav / legend
          // so the calendar reads like a real month view rather than a tiny
          // strip at the top of the page. Falls back to a sensible min-height
          // on small screens.
          height: 'calc(100vh - 240px)',
          minHeight: 620,
        }}
      >
        {/* Day-of-week header */}
        <div className="grid grid-cols-7 border-b flex-none" style={{ borderColor: PALETTE.border, background: PALETTE.bg }}>
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

        {/* Week rows wrapper — each of the 6 weeks shares the remaining
            vertical space equally via flex:1, so the grid fills the
            container instead of collapsing to event height. */}
        <div className="flex-1 flex flex-col">
        {weeks.map((weekDays, weekIdx) => {
          const bars = computeWeekBars(weekDays, shoots);
          const numLanes = bars.length > 0 ? Math.max(...bars.map((b) => b.lane)) + 1 : 0;
          const rowMinHeight = DAY_NUM_H + numLanes * BAR_H + ROW_PAD;

          return (
            <div
              key={weekIdx}
              className="relative grid grid-cols-7 border-b flex-1"
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
                      background: inMonth ? 'transparent' : PALETTE.bgHigh,
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
                const stateColor =
                  STATE_COLORS[shoot.state as BookingState] ?? PALETTE.accent;
                const isStart = new Date(shoot.start + 'T00:00:00Z').getTime() >=
                  weekDays[startCol]?.getTime();
                // Bar starts at the left edge of startCol, spans 'span' columns
                const leftPct = (startCol / 7) * 100;
                const widthPct = (span / 7) * 100;
                const top = DAY_NUM_H + lane * BAR_H + 2;
                const height = BAR_H - 4;

                // Display title — agreed format: "BOOK-0042 - Oliver Begg - AJE, Resort 26".
                const displayTitle = formatBookingTitle({
                  bookingRef: shoot.bookingRef,
                  talentNames: shoot.talentNames,
                  clientName: shoot.clientName,
                  title: shoot.title,
                });

                // Contrast — use a solid bar with bright bg + dark text via
                // YIQ luma. This keeps every state legible (the old scheme
                // failed on yellow `shoot_live` because text and bg were
                // both `#fbbf24`).
                const luma = stateLuma(stateColor);
                const textColor = luma > 0.6 ? '#1a1a1a' : '#ffffff';
                const barBg = stateColor;

                return (
                  <BookingHoverCard
                    key={`${shoot.bookingId}-${weekIdx}`}
                    bookingRef={shoot.bookingRef}
                    title={shoot.title}
                    state={shoot.state as BookingState}
                    shootDates={
                      shoot.start === shoot.end
                        ? new Date(shoot.start + 'T00:00:00Z').toLocaleDateString('en-AU', { day: 'numeric', month: 'short', timeZone: 'UTC' })
                        : `${new Date(shoot.start + 'T00:00:00Z').toLocaleDateString('en-AU', { day: 'numeric', month: 'short', timeZone: 'UTC' })} – ${new Date(shoot.end + 'T00:00:00Z').toLocaleDateString('en-AU', { day: 'numeric', month: 'short', timeZone: 'UTC' })}`
                    }
                    shootLocation={shoot.shootLocation}
                    clientName={shoot.clientName}
                    brandName={shoot.brandName}
                    roster={rosterByBookingId[shoot.bookingId] ?? null}
                    // Take over the absolute positioning so the bar sizes against
                    // the week row, not the inline-block wrapper. The inner Link
                    // fills 100% of this wrapper.
                    wrapperStyle={{
                      position: 'absolute',
                      left: `calc(${leftPct}% + ${isStart ? 4 : 0}px)`,
                      width: `calc(${widthPct}% - ${isStart ? 8 : 4}px)`,
                      top,
                      height,
                      borderRadius: isStart ? 3 : 0,
                      borderTopLeftRadius: isStart ? 3 : 0,
                      borderBottomLeftRadius: isStart ? 3 : 0,
                      borderTopRightRadius: 3,
                      borderBottomRightRadius: 3,
                      background: barBg,
                      borderLeft: isStart ? `3px solid ${darken(stateColor, 0.3)}` : 'none',
                    }}
                  >
                    <Link
                      href={`/bookings/${shoot.bookingId}`}
                      onClick={(e) => e.stopPropagation()}
                      className="flex items-center overflow-hidden transition-opacity hover:opacity-90"
                      style={{
                        width: '100%',
                        height: '100%',
                        lineHeight: `${height}px`,
                        color: textColor,
                        paddingLeft: 6,
                        paddingRight: 4,
                        textDecoration: 'none',
                      }}
                    >
                      <span className="truncate text-[10px] font-semibold">
                        {isStart ? displayTitle : ''}
                      </span>
                    </Link>
                  </BookingHoverCard>
                );
              })}
            </div>
          );
        })}
        </div>
      </div>

      {/* Legend — colour key for the 5 stage groups, plus interaction hint */}
      <div className="mt-3 flex flex-wrap items-center gap-4 text-[10px]" style={{ color: PALETTE.muted }}>
        <span style={{ fontWeight: 600 }}>Stage colour:</span>
        {LEGEND_GROUPS.map((g) => (
          <span key={g.label} className="inline-flex items-center gap-1.5">
            <span
              className="inline-block rounded"
              style={{ width: 12, height: 12, background: g.color }}
              aria-hidden
            />
            {g.label}
          </span>
        ))}
        <span style={{ marginLeft: 'auto', opacity: 0.8 }}>Hover a shoot for crew + copy buttons. Click to open the booking.</span>
      </div>
    </div>
  );
}
