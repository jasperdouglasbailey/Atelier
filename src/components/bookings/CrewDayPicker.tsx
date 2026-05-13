'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import {
  updateBookingCrewAssignedDatesAction,
  updateCrewDayRateOverrideAction,
} from '@/app/actions/quotes';
import { PALETTE } from '@/lib/utils/constants';
import { formatDate, formatCurrency } from '@/lib/utils/format';

type Props = {
  bookingCrewId: string;
  bookingId: string;
  /** All shoot days for the booking, ISO YYYY-MM-DD. */
  shootDays: string[];
  /** Currently assigned days. NULL/empty in DB = assigned to all days. */
  assignedDates: string[] | null;
  /** Row-level day_rate — used as the fallback when no override exists for a date. */
  fallbackDayRate: number | null;
  /** Per-date overrides shaped { "YYYY-MM-DD": amount }. */
  rateOverrides: Record<string, number>;
};

export default function CrewDayPicker({
  bookingCrewId, bookingId, shootDays, assignedDates,
  fallbackDayRate, rateOverrides,
}: Props) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [editingDate, setEditingDate] = useState<string | null>(null);
  const [draftRate, setDraftRate] = useState<string>('');

  const initial = new Set<string>(
    (assignedDates && assignedDates.length > 0) ? assignedDates : shootDays,
  );
  const [selected, setSelected] = useState<Set<string>>(initial);

  function toggle(day: string) {
    const next = new Set(selected);
    if (next.has(day)) next.delete(day);
    else next.add(day);
    setSelected(next);

    setError(null);
    const isAllDays = next.size === shootDays.length;
    const payload = isAllDays ? [] : Array.from(next).sort();
    startTransition(async () => {
      const result = await updateBookingCrewAssignedDatesAction({
        bookingCrewId,
        bookingId,
        assignedDates: payload,
      });
      if ('error' in result) {
        setError(result.error ?? 'Update failed');
        return;
      }
      router.refresh();
    });
  }

  function startEditRate(day: string) {
    setEditingDate(day);
    const current = rateOverrides[day] ?? fallbackDayRate;
    setDraftRate(current != null ? String(current) : '');
  }

  function commitRate(day: string) {
    setError(null);
    const parsed = draftRate.trim() === '' ? null : Number(draftRate);
    // Clearing the override (parsed === null) restores fallback. Same-as-fallback also clears.
    const next = parsed != null && parsed === fallbackDayRate ? null : parsed;
    startTransition(async () => {
      const result = await updateCrewDayRateOverrideAction({
        bookingCrewId,
        bookingId,
        date: day,
        rate: next,
      });
      if ('error' in result) {
        setError(result.error ?? 'Update failed');
        return;
      }
      setEditingDate(null);
      router.refresh();
    });
  }

  function cancelEdit() {
    setEditingDate(null);
    setDraftRate('');
  }

  const isAllDays = selected.size === shootDays.length;
  const expectedTotal = Array.from(selected).reduce((sum, d) => {
    const r = rateOverrides[d] ?? fallbackDayRate ?? 0;
    return sum + r;
  }, 0);
  const hasOverrides = Object.keys(rateOverrides).length > 0;

  return (
    <div className="mt-2 rounded border px-2.5 py-1.5" style={{ borderColor: PALETTE.border, background: PALETTE.bg }}>
      <div className="flex items-center justify-between gap-2 mb-1.5">
        <span
          style={{
            fontFamily: 'var(--font-dm-mono), monospace',
            fontSize: 9,
            fontWeight: 500,
            letterSpacing: '0.16em',
            textTransform: 'uppercase',
            color: PALETTE.muted,
          }}
        >
          Days &amp; rate {pending && '·'}
        </span>
        {pending && (
          <span style={{ fontSize: 10, color: PALETTE.muted }}>Saving…</span>
        )}
      </div>

      {/* Day rows — each row: toggle pill + inline rate */}
      <div className="flex flex-col gap-1">
        {shootDays.map((day) => {
          const on = selected.has(day);
          const override = rateOverrides[day];
          const effectiveRate = override ?? fallbackDayRate;
          const isOverride = override != null;
          const isEditingThis = editingDate === day;

          return (
            <div key={day} className="flex items-center gap-1.5">
              <button
                type="button"
                onClick={() => toggle(day)}
                disabled={pending}
                className="rounded px-2 py-0.5 text-[10px] font-medium transition-colors disabled:opacity-60 flex-shrink-0"
                style={{
                  background: on ? PALETTE.text : 'transparent',
                  color: on ? PALETTE.bg : PALETTE.muted,
                  border: `1px solid ${on ? PALETTE.text : PALETTE.border}`,
                  cursor: 'pointer',
                  minWidth: 64,
                  textAlign: 'left',
                }}
              >
                {formatDate(day)}
              </button>

              {on && (isEditingThis ? (
                <span className="inline-flex items-center gap-1">
                  <input
                    type="number"
                    step="50"
                    min="0"
                    value={draftRate}
                    autoFocus
                    onChange={(e) => setDraftRate(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') commitRate(day);
                      if (e.key === 'Escape') cancelEdit();
                    }}
                    className="w-20 rounded border px-1.5 py-0.5 text-[10px] tabular-nums"
                    style={{ background: PALETTE.bg, borderColor: PALETTE.accent + '66', color: PALETTE.text }}
                    placeholder={fallbackDayRate != null ? String(fallbackDayRate) : 'rate'}
                  />
                  <button
                    type="button"
                    onClick={() => commitRate(day)}
                    disabled={pending}
                    className="text-[10px] font-medium"
                    style={{ color: PALETTE.accent }}
                  >
                    Save
                  </button>
                  <button
                    type="button"
                    onClick={cancelEdit}
                    disabled={pending}
                    className="text-[10px]"
                    style={{ color: PALETTE.muted }}
                  >
                    Esc
                  </button>
                </span>
              ) : (
                <button
                  type="button"
                  onClick={() => startEditRate(day)}
                  className="text-[10px] tabular-nums"
                  style={{
                    color: isOverride ? PALETTE.accent : PALETTE.muted,
                    fontWeight: isOverride ? 600 : 400,
                  }}
                  title={isOverride ? 'Override — click to edit' : 'Falls back to row day rate — click to override'}
                >
                  {effectiveRate != null ? formatCurrency(effectiveRate) : '— set rate'}
                </button>
              ))}
            </div>
          );
        })}
      </div>

      {/* Summary */}
      <div className="mt-1.5 flex items-center justify-between text-[10px]" style={{ color: PALETTE.muted }}>
        <span>
          {isAllDays ? `On all ${shootDays.length} days` : `On ${selected.size} of ${shootDays.length} days`}
          {hasOverrides && ' · with overrides'}
        </span>
        {fallbackDayRate != null && selected.size > 0 && (
          <span className="tabular-nums" title="Expected total — informational only; doesn't auto-create fee lines">
            ≈ {formatCurrency(expectedTotal)}
          </span>
        )}
      </div>

      {error && (
        <div className="mt-1" style={{ fontSize: 10, color: PALETTE.danger }}>{error}</div>
      )}
    </div>
  );
}
