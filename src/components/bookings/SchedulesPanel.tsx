'use client';

import { useState, useTransition } from 'react';
import { PALETTE } from '@/lib/utils/constants';
import { upsertScheduleAction, deleteScheduleAction } from '@/app/actions/booking-schedules';
import type { BookingSchedule } from '@/lib/types/database';

type Props = {
  bookingId: string;
  initial: BookingSchedule[];
  /** ISO date strings of the booking's shoot days (from parseDateRangeRaw) */
  shootDays?: string[];
};

function formatTime(t: string | null) {
  if (!t) return '—';
  // PostgreSQL returns time as HH:MM:SS — truncate to HH:MM
  return t.slice(0, 5);
}

export default function SchedulesPanel({ bookingId, initial, shootDays = [] }: Props) {
  const [schedules, setSchedules] = useState<BookingSchedule[]>(initial);
  const [editingId, setEditingId] = useState<string | 'new' | null>(null);
  const [editDate, setEditDate] = useState('');
  const [editCall, setEditCall] = useState('');
  const [editWrap, setEditWrap] = useState('');
  const [editLocation, setEditLocation] = useState('');
  const [editNotes, setEditNotes] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function startNew() {
    setEditingId('new');
    setEditDate(shootDays[0] ?? '');
    setEditCall('');
    setEditWrap('');
    setEditLocation('');
    setEditNotes('');
    setError(null);
  }

  function startEdit(s: BookingSchedule) {
    setEditingId(s.id);
    setEditDate(s.schedule_date);
    setEditCall(s.call_time?.slice(0, 5) ?? '');
    setEditWrap(s.wrap_time?.slice(0, 5) ?? '');
    setEditLocation(s.location ?? '');
    setEditNotes(s.notes ?? '');
    setError(null);
  }

  function handleSave(e: React.FormEvent) {
    e.preventDefault();
    if (!editDate) { setError('Date is required'); return; }
    setError(null);
    startTransition(async () => {
      const result = await upsertScheduleAction(bookingId, editDate, {
        call_time: editCall || null,
        wrap_time: editWrap || null,
        location: editLocation || null,
        notes: editNotes || null,
      });
      if (!result.ok) { setError(result.error); return; }
      // Update local state
      setSchedules((prev) => {
        const existing = prev.find((s) => s.schedule_date === editDate);
        const updated: BookingSchedule = {
          id: existing?.id ?? `tmp-${editDate}`,
          created_at: existing?.created_at ?? new Date().toISOString(),
          booking_id: bookingId,
          schedule_date: editDate,
          call_time: editCall || null,
          wrap_time: editWrap || null,
          location: editLocation || null,
          notes: editNotes || null,
        };
        return existing
          ? prev.map((s) => s.schedule_date === editDate ? updated : s)
          : [...prev, updated].sort((a, b) => a.schedule_date.localeCompare(b.schedule_date));
      });
      setEditingId(null);
    });
  }

  function handleDelete(s: BookingSchedule) {
    if (!confirm(`Delete schedule for ${s.schedule_date}?`)) return;
    startTransition(async () => {
      const result = await deleteScheduleAction(s.id, bookingId);
      if (!result.ok) { setError(result.error); return; }
      setSchedules((prev) => prev.filter((r) => r.id !== s.id));
    });
  }

  const inputClass = 'w-full rounded border px-2.5 py-1.5 text-xs';
  const inputStyle = { borderColor: PALETTE.border, color: PALETTE.text, background: PALETTE.bg };

  const isEditing = editingId !== null;

  return (
    <div className="space-y-3">
      <p className="text-[10px]" style={{ color: PALETTE.muted }}>
        Per-day times and location override the booking-level defaults in the call sheet.
      </p>
      {schedules.length === 0 && !isEditing && (
        <p className="text-xs" style={{ color: PALETTE.muted }}>
          No day-by-day schedule yet. Add one for each shoot day.
        </p>
      )}

      {/* Schedule rows */}
      {schedules.map((s) => (
        editingId === s.id ? (
          <ScheduleForm
            key={s.id}
            shootDays={shootDays}
            editDate={editDate}
            editCall={editCall}
            editWrap={editWrap}
            editLocation={editLocation}
            editNotes={editNotes}
            setEditDate={setEditDate}
            setEditCall={setEditCall}
            setEditWrap={setEditWrap}
            setEditLocation={setEditLocation}
            setEditNotes={setEditNotes}
            onSave={handleSave}
            onCancel={() => { setEditingId(null); setError(null); }}
            pending={pending}
            error={error}
            inputClass={inputClass}
            inputStyle={inputStyle}
          />
        ) : (
          <div
            key={s.id}
            className="rounded border p-3"
            style={{ borderColor: PALETTE.border, background: PALETTE.surface }}
          >
            <div className="flex items-start justify-between gap-2">
              <div>
                <div className="text-xs font-semibold" style={{ color: PALETTE.text }}>
                  {s.schedule_date}
                </div>
                <div className="mt-1 space-y-0.5 text-[11px]" style={{ color: PALETTE.muted }}>
                  {(s.call_time || s.wrap_time) && (
                    <div className="whitespace-nowrap">Call {formatTime(s.call_time)} → Wrap {formatTime(s.wrap_time)}</div>
                  )}
                  {s.location && <div>{s.location}</div>}
                  {s.notes && <div>{s.notes}</div>}
                </div>
              </div>
              <div className="flex gap-2 shrink-0 text-[10px]">
                <button
                  type="button"
                  onClick={() => startEdit(s)}
                  disabled={pending || isEditing}
                  style={{ color: PALETTE.accent, background: 'none', border: 'none', cursor: 'pointer' }}
                >
                  Edit
                </button>
                <button
                  type="button"
                  onClick={() => handleDelete(s)}
                  disabled={pending || isEditing}
                  style={{ color: PALETTE.danger, background: 'none', border: 'none', cursor: 'pointer' }}
                >
                  Delete
                </button>
              </div>
            </div>
          </div>
        )
      ))}

      {/* New schedule form */}
      {editingId === 'new' && (
        <ScheduleForm
          shootDays={shootDays}
          editDate={editDate}
          editCall={editCall}
          editWrap={editWrap}
          editLocation={editLocation}
          editNotes={editNotes}
          setEditDate={setEditDate}
          setEditCall={setEditCall}
          setEditWrap={setEditWrap}
          setEditLocation={setEditLocation}
          setEditNotes={setEditNotes}
          onSave={handleSave}
          onCancel={() => { setEditingId(null); setError(null); }}
          pending={pending}
          error={error}
          inputClass={inputClass}
          inputStyle={inputStyle}
        />
      )}

      {!isEditing && (
        <button
          type="button"
          onClick={startNew}
          className="rounded px-3 py-1.5 text-xs font-medium"
          style={{ background: `${PALETTE.accent}18`, color: PALETTE.accent, border: `1px solid ${PALETTE.accent}44`, cursor: 'pointer' }}
        >
          + Add day schedule
        </button>
      )}
    </div>
  );
}

function ScheduleForm({
  shootDays, editDate, editCall, editWrap, editLocation, editNotes,
  setEditDate, setEditCall, setEditWrap, setEditLocation, setEditNotes,
  onSave, onCancel, pending, error, inputClass, inputStyle,
}: {
  shootDays: string[];
  editDate: string;
  editCall: string;
  editWrap: string;
  editLocation: string;
  editNotes: string;
  setEditDate: (v: string) => void;
  setEditCall: (v: string) => void;
  setEditWrap: (v: string) => void;
  setEditLocation: (v: string) => void;
  setEditNotes: (v: string) => void;
  onSave: (e: React.FormEvent) => void;
  onCancel: () => void;
  pending: boolean;
  error: string | null;
  inputClass: string;
  inputStyle: React.CSSProperties;
}) {
  return (
    <form onSubmit={onSave} className="rounded border p-3 space-y-2" style={{ borderColor: PALETTE.accent, background: `${PALETTE.accent}0a` }}>
      <p className="text-[11px] font-semibold uppercase tracking-wide" style={{ color: PALETTE.accent }}>
        Day schedule
      </p>
      {error && <p className="text-[11px]" style={{ color: PALETTE.danger }}>{error}</p>}
      <div>
        <label className="block text-[10px] mb-1 uppercase tracking-wide" style={{ color: PALETTE.muted }}>Date *</label>
        {shootDays.length > 0 ? (
          <select value={editDate} onChange={(e) => setEditDate(e.target.value)} className={inputClass} style={inputStyle}>
            <option value="">Select day…</option>
            {shootDays.map((d) => <option key={d} value={d}>{d}</option>)}
            <option value={editDate && !shootDays.includes(editDate) ? editDate : ''}>{editDate && !shootDays.includes(editDate) ? editDate : 'Custom…'}</option>
          </select>
        ) : (
          <input type="date" required value={editDate} onChange={(e) => setEditDate(e.target.value)} className={inputClass} style={inputStyle} />
        )}
      </div>
      <div className="grid grid-cols-2 gap-2">
        <div>
          <label className="block text-[10px] mb-1 uppercase tracking-wide" style={{ color: PALETTE.muted }}>Call time</label>
          <input type="time" value={editCall} onChange={(e) => setEditCall(e.target.value)} className={inputClass} style={inputStyle} />
        </div>
        <div>
          <label className="block text-[10px] mb-1 uppercase tracking-wide" style={{ color: PALETTE.muted }}>Wrap time</label>
          <input type="time" value={editWrap} onChange={(e) => setEditWrap(e.target.value)} className={inputClass} style={inputStyle} />
        </div>
      </div>
      <div>
        <label className="block text-[10px] mb-1 uppercase tracking-wide" style={{ color: PALETTE.muted }}>Location (overrides booking default)</label>
        <input type="text" value={editLocation} onChange={(e) => setEditLocation(e.target.value)} className={inputClass} style={inputStyle} placeholder="e.g. Studio 2, 45 Clarence St" />
      </div>
      <div>
        <label className="block text-[10px] mb-1 uppercase tracking-wide" style={{ color: PALETTE.muted }}>Notes</label>
        <input type="text" value={editNotes} onChange={(e) => setEditNotes(e.target.value)} className={inputClass} style={inputStyle} placeholder="e.g. Bring extra batteries" />
      </div>
      <div className="flex gap-2 pt-1">
        <button
          type="submit"
          disabled={pending || !editDate}
          className="rounded px-3 py-1.5 text-xs font-medium disabled:opacity-50"
          style={{ background: PALETTE.accent, color: PALETTE.bg, border: 'none', cursor: 'pointer' }}
        >
          {pending ? 'Saving…' : 'Save'}
        </button>
        <button
          type="button"
          onClick={onCancel}
          className="rounded px-3 py-1.5 text-xs"
          style={{ color: PALETTE.muted, border: `1px solid ${PALETTE.border}`, background: 'transparent', cursor: 'pointer' }}
        >
          Cancel
        </button>
      </div>
    </form>
  );
}
