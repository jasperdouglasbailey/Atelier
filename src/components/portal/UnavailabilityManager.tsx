'use client';

import { useState, useTransition } from 'react';
import { PALETTE } from '@/lib/utils/constants';
import { addCrewUnavailabilityAction, removeCrewUnavailabilityAction } from '@/app/actions/portal';
import type { CrewUnavailability } from '@/lib/types/database';

type Props = {
  initial: CrewUnavailability[];
};

function formatDateRange(from: string, to: string): string {
  if (from === to) return from;
  return `${from} → ${to}`;
}

export default function UnavailabilityManager({ initial }: Props) {
  const [rows, setRows] = useState<CrewUnavailability[]>(initial);
  const [adding, setAdding] = useState(false);
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [reason, setReason] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function handleAdd(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    startTransition(async () => {
      const result = await addCrewUnavailabilityAction(dateFrom, dateTo || dateFrom, reason || null);
      if (!result.ok) { setError(result.error); return; }
      setRows((prev) => [
        ...prev,
        { id: result.id, created_at: new Date().toISOString(), crew_id: '', date_from: dateFrom, date_to: dateTo || dateFrom, reason: reason || null },
      ]);
      setAdding(false);
      setDateFrom('');
      setDateTo('');
      setReason('');
    });
  }

  function handleRemove(id: string) {
    startTransition(async () => {
      const result = await removeCrewUnavailabilityAction(id);
      if (!result.ok) { setError(result.error); return; }
      setRows((prev) => prev.filter((r) => r.id !== id));
    });
  }

  const inputStyle = { borderColor: PALETTE.border, color: PALETTE.text, background: PALETTE.bg };
  const inputClass = 'w-full rounded border px-2.5 py-1.5 text-xs';

  return (
    <div className="space-y-3">
      {rows.length === 0 && !adding && (
        <p className="text-xs" style={{ color: PALETTE.muted }}>No blocked dates. Add any dates you are unavailable.</p>
      )}

      {rows.length > 0 && (
        <ul className="space-y-1.5">
          {rows.map((r) => (
            <li
              key={r.id}
              className="flex items-center justify-between gap-3 rounded border px-3 py-2 text-xs"
              style={{ borderColor: PALETTE.border, background: PALETTE.surface }}
            >
              <div>
                <span style={{ color: PALETTE.text }}>{formatDateRange(r.date_from, r.date_to)}</span>
                {r.reason && <span className="ml-2" style={{ color: PALETTE.muted }}>{r.reason}</span>}
              </div>
              <button
                type="button"
                onClick={() => handleRemove(r.id)}
                disabled={pending}
                className="text-[10px] disabled:opacity-40"
                style={{ color: PALETTE.danger, cursor: 'pointer', background: 'none', border: 'none' }}
              >
                Remove
              </button>
            </li>
          ))}
        </ul>
      )}

      {adding ? (
        <form onSubmit={handleAdd} className="rounded border p-3 space-y-2.5" style={{ borderColor: PALETTE.accent, background: `${PALETTE.accent}0a` }}>
          <p className="text-[11px] font-semibold uppercase tracking-wide" style={{ color: PALETTE.accent }}>Add blocked dates</p>
          {error && <p className="text-[11px]" style={{ color: PALETTE.danger }}>{error}</p>}
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="block text-[10px] mb-1 uppercase tracking-wide" style={{ color: PALETTE.muted }}>From *</label>
              <input type="date" required value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} className={inputClass} style={inputStyle} />
            </div>
            <div>
              <label className="block text-[10px] mb-1 uppercase tracking-wide" style={{ color: PALETTE.muted }}>To</label>
              <input type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)} className={inputClass} style={inputStyle} min={dateFrom} placeholder={dateFrom} />
            </div>
          </div>
          <div>
            <label className="block text-[10px] mb-1 uppercase tracking-wide" style={{ color: PALETTE.muted }}>Reason (optional)</label>
            <input type="text" value={reason} onChange={(e) => setReason(e.target.value)} className={inputClass} style={inputStyle} placeholder="e.g. Holiday, prior commitment" />
          </div>
          <div className="flex gap-2 pt-1">
            <button
              type="submit"
              disabled={pending || !dateFrom}
              className="rounded px-3 py-1.5 text-xs font-medium disabled:opacity-50"
              style={{ background: PALETTE.accent, color: PALETTE.bg, border: 'none', cursor: 'pointer' }}
            >
              {pending ? 'Saving…' : 'Save'}
            </button>
            <button
              type="button"
              onClick={() => { setAdding(false); setError(null); }}
              className="rounded px-3 py-1.5 text-xs"
              style={{ color: PALETTE.muted, border: `1px solid ${PALETTE.border}`, background: 'transparent', cursor: 'pointer' }}
            >
              Cancel
            </button>
          </div>
        </form>
      ) : (
        <button
          type="button"
          onClick={() => setAdding(true)}
          className="rounded px-3 py-1.5 text-xs font-medium"
          style={{ background: `${PALETTE.accent}18`, color: PALETTE.accent, border: `1px solid ${PALETTE.accent}44`, cursor: 'pointer' }}
        >
          + Add blocked dates
        </button>
      )}
    </div>
  );
}
