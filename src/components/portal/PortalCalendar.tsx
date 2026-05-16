'use client';

/**
 * Interactive month calendar for the talent + crew portals.
 *
 * Replaces the form-based UnavailabilityManager pattern with a visual
 * one. Surfaces three things on one canvas:
 *
 *   1. Confirmed + held bookings — coloured dots on each covered day
 *   2. Self-reported blocked dates — muted strikethrough background
 *   3. Today — accent ring
 *
 * Interactions:
 *   - Click a day → it becomes "selected"; the panel below the grid
 *     shows actions for that day:
 *       - If unblocked: "Block this day" button + optional reason +
 *         optional "to date" (range)
 *       - If blocked:   shows reason + Remove button
 *   - Prev/next month nav
 *   - readOnly disables the action panel (used in owner-preview mode)
 *
 * Why no drag-to-select: drag-to-block-a-range is real engineering for
 * touch + mouse + edge cases. The "select day, then optionally type
 * to-date" pattern is faster to implement and good enough for the
 * primary use case (block a holiday, block a conflicting shoot day).
 *
 * Server actions are passed in as props — the parent portal page wires
 * `addTalentUnavailabilityAction` / `addCrewUnavailabilityAction` etc.
 * Means the same component works in both portals without role detection.
 */

import { useMemo, useState, useTransition } from 'react';
import { PALETTE } from '@/lib/utils/constants';
import { formatShootDates } from '@/lib/utils/format';

const DAY_LABELS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

export type CalendarBooking = {
  bookingId: string;
  bookingRef: string | null;
  title: string;
  /** Postgres daterange literal. Bookings with no daterange don't render on the grid. */
  shootDates: string | null;
  /** confirmed/held drives the colour: green = confirmed, amber = held/pending. */
  confirmed: boolean;
  status: string;
};

export type CalendarUnavailability = {
  id: string;
  date_from: string; // YYYY-MM-DD
  date_to: string;   // YYYY-MM-DD (inclusive)
  reason: string | null;
};

type Props = {
  bookings: CalendarBooking[];
  unavailability: CalendarUnavailability[];
  /** Server action: block dateFrom..dateTo with optional reason. Same shape for talent + crew. */
  onAdd: (dateFrom: string, dateTo: string, reason: string | null) => Promise<{ ok: true; id: string } | { ok: false; error: string }>;
  /** Server action: remove the unavailability row by id. */
  onRemove: (id: string) => Promise<{ ok: true } | { ok: false; error: string }>;
  readOnly?: boolean;
};

// ─── helpers ──────────────────────────────────────────────────────────────────

function isoDay(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

/**
 * Parse a Postgres daterange literal `[start,end)` and return every covered
 * day as YYYY-MM-DD. The end is exclusive — covers up to but not including.
 */
function expandDaterange(literal: string | null): string[] {
  if (!literal) return [];
  const m = literal.match(/^[\[(](\d{4}-\d{2}-\d{2})?,(\d{4}-\d{2}-\d{2})?[\])]$/);
  if (!m || !m[1]) return [];
  const start = new Date(`${m[1]}T00:00:00`);
  if (!m[2]) return [isoDay(start)];
  const end = new Date(`${m[2]}T00:00:00`); // exclusive
  const out: string[] = [];
  const iter = new Date(start);
  while (iter < end) {
    out.push(isoDay(iter));
    iter.setDate(iter.getDate() + 1);
  }
  return out;
}

/** date_from..date_to is INCLUSIVE — both ends are covered. */
function expandInclusiveRange(from: string, to: string): string[] {
  const start = new Date(`${from}T00:00:00`);
  const end = new Date(`${to}T00:00:00`);
  const out: string[] = [];
  const iter = new Date(start);
  while (iter <= end) {
    out.push(isoDay(iter));
    iter.setDate(iter.getDate() + 1);
  }
  return out;
}

// ─── component ────────────────────────────────────────────────────────────────

export default function PortalCalendar({ bookings, unavailability, onAdd, onRemove, readOnly = false }: Props) {
  const [monthOffset, setMonthOffset] = useState(0);
  const [selectedDay, setSelectedDay] = useState<string | null>(null);
  const [rangeTo, setRangeTo] = useState('');
  const [reason, setReason] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  // Build the "visible month" — today + monthOffset months.
  const now = new Date();
  const visible = new Date(now.getFullYear(), now.getMonth() + monthOffset, 1);
  const todayISO = isoDay(now);

  // Per-day maps for fast cell rendering.
  const bookingsByDay = useMemo(() => {
    const map = new Map<string, CalendarBooking[]>();
    for (const b of bookings) {
      for (const day of expandDaterange(b.shootDates)) {
        const list = map.get(day) ?? [];
        list.push(b);
        map.set(day, list);
      }
    }
    return map;
  }, [bookings]);

  const blocksByDay = useMemo(() => {
    const map = new Map<string, CalendarUnavailability>();
    for (const u of unavailability) {
      for (const day of expandInclusiveRange(u.date_from, u.date_to)) {
        map.set(day, u);
      }
    }
    return map;
  }, [unavailability]);

  // Build the grid — Mon..Sun, lead with blanks for offset.
  const year = visible.getFullYear();
  const month = visible.getMonth();
  const first = new Date(year, month, 1);
  const dow = first.getDay(); // 0=Sun
  const leadingBlanks = (dow + 6) % 7; // Mon-start
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const cells: Array<{ day: number | null; iso: string | null }> = [];
  for (let i = 0; i < leadingBlanks; i++) cells.push({ day: null, iso: null });
  for (let d = 1; d <= daysInMonth; d++) {
    cells.push({ day: d, iso: `${year}-${String(month + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}` });
  }
  while (cells.length % 7 !== 0) cells.push({ day: null, iso: null });

  const monthName = first.toLocaleDateString('en-AU', { month: 'long', year: 'numeric' });

  // ─── selected-day actions ─────────────────────────────────────────────────
  const selectedBlock = selectedDay ? blocksByDay.get(selectedDay) ?? null : null;
  const selectedBookings = selectedDay ? bookingsByDay.get(selectedDay) ?? [] : [];

  function handleBlock() {
    if (!selectedDay) return;
    setError(null);
    const from = selectedDay;
    const to = rangeTo || selectedDay;
    if (to < from) { setError('End date must be on or after the start.'); return; }
    const reasonValue = reason.trim() || null;
    startTransition(async () => {
      const result = await onAdd(from, to, reasonValue);
      if (!result.ok) { setError(result.error); return; }
      // Clear inputs, the parent revalidates and the calendar re-renders.
      setRangeTo('');
      setReason('');
      setSelectedDay(null);
    });
  }

  function handleRemove() {
    if (!selectedBlock) return;
    setError(null);
    startTransition(async () => {
      const result = await onRemove(selectedBlock.id);
      if (!result.ok) { setError(result.error); return; }
      setSelectedDay(null);
    });
  }

  return (
    <div className="space-y-3">
      {/* Header: month label + prev/next nav */}
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold" style={{ color: PALETTE.text }}>{monthName}</h3>
        <div className="flex gap-1">
          <button
            type="button"
            onClick={() => { setMonthOffset((n) => n - 1); setSelectedDay(null); }}
            className="rounded border px-2 py-1 text-[11px]"
            style={{ borderColor: PALETTE.border, color: PALETTE.text, background: PALETTE.surface, cursor: 'pointer' }}
            aria-label="Previous month"
          >
            ‹
          </button>
          <button
            type="button"
            onClick={() => { setMonthOffset(0); setSelectedDay(null); }}
            className="rounded border px-2 py-1 text-[11px]"
            style={{ borderColor: PALETTE.border, color: PALETTE.text, background: PALETTE.surface, cursor: 'pointer' }}
            disabled={monthOffset === 0}
          >
            Today
          </button>
          <button
            type="button"
            onClick={() => { setMonthOffset((n) => n + 1); setSelectedDay(null); }}
            className="rounded border px-2 py-1 text-[11px]"
            style={{ borderColor: PALETTE.border, color: PALETTE.text, background: PALETTE.surface, cursor: 'pointer' }}
            aria-label="Next month"
          >
            ›
          </button>
        </div>
      </div>

      {/* Grid */}
      <div>
        <div className="grid grid-cols-7 gap-0.5 mb-1">
          {DAY_LABELS.map((l) => (
            <div key={l} className="text-[10px] uppercase tracking-wide text-center" style={{ color: PALETTE.muted }}>
              {l}
            </div>
          ))}
        </div>
        <div className="grid grid-cols-7 gap-0.5">
          {cells.map((cell, i) => {
            if (!cell.iso || !cell.day) {
              return <div key={i} className="aspect-square" />;
            }
            const isToday = cell.iso === todayISO;
            const isSelected = cell.iso === selectedDay;
            const block = blocksByDay.get(cell.iso);
            const dayBookings = bookingsByDay.get(cell.iso) ?? [];
            const hasConfirmed = dayBookings.some((b) => b.confirmed);
            const hasHeld = dayBookings.some((b) => !b.confirmed);

            const bg = isSelected
              ? `${PALETTE.accent}22`
              : block
                ? `${PALETTE.muted}18`
                : PALETTE.surface;
            const borderColor = isSelected
              ? PALETTE.accent
              : isToday
                ? PALETTE.accent
                : PALETTE.border;

            return (
              <button
                key={cell.iso}
                type="button"
                onClick={() => {
                  setError(null);
                  setRangeTo('');
                  setReason(block?.reason ?? '');
                  setSelectedDay(cell.iso);
                }}
                disabled={readOnly && !block}
                className="aspect-square rounded relative flex flex-col items-start p-1 transition-colors hover:opacity-90 disabled:cursor-not-allowed"
                style={{
                  background: bg,
                  border: `1px solid ${borderColor}`,
                  borderWidth: isToday ? 2 : 1,
                  cursor: readOnly && !block ? 'default' : 'pointer',
                }}
                aria-label={`${cell.day} — ${block ? 'blocked' : dayBookings.length > 0 ? `${dayBookings.length} booking` : 'free'}`}
              >
                <span
                  className="text-[10px] tabular-nums leading-none"
                  style={{
                    color: block ? PALETTE.muted : PALETTE.text,
                    textDecoration: block ? 'line-through' : undefined,
                  }}
                >
                  {cell.day}
                </span>
                {/* Booking dots — max 2 visible, "+N" overflow */}
                {dayBookings.length > 0 && (
                  <div className="flex gap-0.5 mt-auto self-start flex-wrap">
                    {hasConfirmed && (
                      <span
                        className="inline-block rounded-full"
                        style={{ width: 5, height: 5, background: PALETTE.success }}
                        title="Confirmed booking"
                      />
                    )}
                    {hasHeld && (
                      <span
                        className="inline-block rounded-full"
                        style={{ width: 5, height: 5, background: PALETTE.warning }}
                        title="Hold pending"
                      />
                    )}
                  </div>
                )}
              </button>
            );
          })}
        </div>
      </div>

      {/* Legend */}
      <div className="flex gap-3 text-[10px] flex-wrap" style={{ color: PALETTE.muted }}>
        <span className="flex items-center gap-1">
          <span className="inline-block rounded-full" style={{ width: 6, height: 6, background: PALETTE.success }} /> Confirmed
        </span>
        <span className="flex items-center gap-1">
          <span className="inline-block rounded-full" style={{ width: 6, height: 6, background: PALETTE.warning }} /> Held
        </span>
        <span className="flex items-center gap-1">
          <span className="inline-block w-2.5" style={{ borderTop: `1px solid ${PALETTE.muted}` }} /> Blocked
        </span>
      </div>

      {/* Selected day panel */}
      {selectedDay && (
        <div
          className="rounded-lg border p-3 space-y-2"
          style={{
            borderColor: selectedBlock ? PALETTE.muted : PALETTE.accent,
            background: selectedBlock ? `${PALETTE.muted}0a` : `${PALETTE.accent}08`,
          }}
        >
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold" style={{ color: PALETTE.text }}>
              {new Date(`${selectedDay}T00:00:00`).toLocaleDateString('en-AU', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' })}
            </span>
            <button
              type="button"
              onClick={() => { setSelectedDay(null); setError(null); }}
              className="text-[11px]"
              style={{ color: PALETTE.muted, background: 'none', border: 'none', cursor: 'pointer' }}
            >
              Close
            </button>
          </div>

          {/* Existing bookings on this day */}
          {selectedBookings.length > 0 && (
            <div className="text-[11px]" style={{ color: PALETTE.muted }}>
              {selectedBookings.map((b) => (
                <div key={b.bookingId}>
                  · {b.bookingRef ?? b.title} {b.confirmed ? '(confirmed)' : '(held)'}{' '}
                  <span style={{ opacity: 0.7 }}>{formatShootDates(b.shootDates)}</span>
                </div>
              ))}
            </div>
          )}

          {error && <p className="text-[11px]" style={{ color: PALETTE.danger }}>{error}</p>}

          {selectedBlock ? (
            // ─── Already blocked: show reason + Remove ─────────────────────
            <div className="space-y-1.5">
              <div className="text-[11px]" style={{ color: PALETTE.text }}>
                Blocked: {selectedBlock.date_from === selectedBlock.date_to
                  ? selectedBlock.date_from
                  : `${selectedBlock.date_from} → ${selectedBlock.date_to}`}
                {selectedBlock.reason && <span style={{ color: PALETTE.muted }}> · {selectedBlock.reason}</span>}
              </div>
              {!readOnly && (
                <button
                  type="button"
                  onClick={handleRemove}
                  disabled={pending}
                  className="rounded px-3 py-1 text-xs font-medium disabled:opacity-50"
                  style={{ background: 'transparent', color: PALETTE.danger, border: `1px solid ${PALETTE.danger}55`, cursor: 'pointer' }}
                >
                  {pending ? 'Removing…' : 'Remove block'}
                </button>
              )}
            </div>
          ) : (
            // ─── Not blocked: show "block this day" form ──────────────────
            !readOnly && (
              <div className="space-y-2">
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="block text-[10px] uppercase tracking-wide mb-0.5" style={{ color: PALETTE.muted }}>To date (optional)</label>
                    <input
                      type="date"
                      value={rangeTo}
                      min={selectedDay}
                      onChange={(e) => setRangeTo(e.target.value)}
                      placeholder={selectedDay}
                      className="w-full rounded border px-2 py-1 text-xs"
                      style={{ borderColor: PALETTE.border, background: PALETTE.bg, color: PALETTE.text }}
                    />
                  </div>
                  <div>
                    <label className="block text-[10px] uppercase tracking-wide mb-0.5" style={{ color: PALETTE.muted }}>Reason (optional)</label>
                    <input
                      type="text"
                      value={reason}
                      onChange={(e) => setReason(e.target.value)}
                      placeholder="Holiday, conflicting work…"
                      className="w-full rounded border px-2 py-1 text-xs"
                      style={{ borderColor: PALETTE.border, background: PALETTE.bg, color: PALETTE.text }}
                    />
                  </div>
                </div>
                <button
                  type="button"
                  onClick={handleBlock}
                  disabled={pending}
                  className="rounded px-3 py-1 text-xs font-medium disabled:opacity-50"
                  style={{ background: PALETTE.accent, color: PALETTE.bg, border: 'none', cursor: 'pointer' }}
                >
                  {pending ? 'Saving…' : (rangeTo && rangeTo !== selectedDay ? 'Block range' : 'Block this day')}
                </button>
              </div>
            )
          )}
        </div>
      )}
    </div>
  );
}
