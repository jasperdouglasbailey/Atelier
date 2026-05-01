'use client';

import { useState } from 'react';
import { addOTLineAction, addExpenseLineAction } from '@/app/actions/quotes';
import { computeOT } from '@/lib/utils/fee-engine';
import { PALETTE } from '@/lib/utils/constants';
import type { BookingCrew } from '@/lib/types/database';

type Props = {
  bookingId: string;
  quoteVersionId: string;
  windowEnd: string;        // ISO timestamp
  isLocked: boolean;
  bookingCrew: (BookingCrew & { crew?: { name: string } | null })[];
};

const EXPENSE_TYPES = [
  { value: 'catering', label: 'Catering' },
  { value: 'travel', label: 'Travel / Transport' },
  { value: 'studio_hire', label: 'Studio Hire' },
  { value: 'equipment_rental', label: 'Equipment Rental' },
  { value: 'props', label: 'Props' },
  { value: 'wardrobe', label: 'Wardrobe' },
  { value: 'location_fee', label: 'Location Fee' },
  { value: 'permits', label: 'Permits' },
  { value: 'insurance', label: 'Insurance' },
  { value: 'other_expense', label: 'Other Expense' },
] as const;

const inputClass = 'w-full rounded border bg-transparent px-2.5 py-1.5 text-sm';
const inputStyle = { borderColor: PALETTE.border, color: PALETTE.text, background: PALETTE.bg };
const labelClass = 'block text-[11px] font-medium mb-0.5';
const labelStyle = { color: PALETTE.muted };

export default function OTExpenseEntry({ bookingId, quoteVersionId, windowEnd, isLocked, bookingCrew }: Props) {
  const [mode, setMode] = useState<'ot' | 'expense'>('ot');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  // OT form state
  const [crewId, setCrewId] = useState('');
  const [hoursWorked, setHoursWorked] = useState('');
  const [dayRate, setDayRate] = useState('');
  const [isHalfDay, setIsHalfDay] = useState(false);

  // Expense form state
  const [expenseType, setExpenseType] = useState('catering');
  const [expenseDesc, setExpenseDesc] = useState('');
  const [expenseAmount, setExpenseAmount] = useState('');
  const [expenseNotes, setExpenseNotes] = useState('');

  const windowEndDate = new Date(windowEnd);
  const now = new Date();
  const hoursLeft = Math.max(0, (windowEndDate.getTime() - now.getTime()) / (1000 * 60 * 60));
  const windowExpired = now > windowEndDate;

  // Preview OT calculation
  const otPreview = (() => {
    const h = parseFloat(hoursWorked);
    const r = parseFloat(dayRate);
    if (!h || !r || h <= 0 || r <= 0) return null;
    const result = computeOT(h, r, isHalfDay, true); // true = crew member (1.5x OT)
    return result.otTotal > 0 ? result : null;
  })();

  async function handleOTSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!otPreview) { setError('No overtime to record — hours are within the day rate threshold.'); return; }
    setSubmitting(true); setError(null); setSuccess(null);

    const crewMember = bookingCrew.find((c) => c.crew_id === crewId);
    const crewName = crewMember?.crew?.name ?? 'Crew Member';
    const desc = `OT — ${crewName} (${hoursWorked}h worked${isHalfDay ? ', half day' : ''})`;

    const fd = new FormData();
    fd.set('booking_id', bookingId);
    fd.set('quote_version_id', quoteVersionId);
    fd.set('description', desc);
    fd.set('quantity', String(otPreview.otHours));
    fd.set('unit_price', String(otPreview.otRate));
    fd.set('crew_id', crewId);

    const result = await addOTLineAction(fd);
    setSubmitting(false);
    if ('error' in result) { setError(result.error ?? 'Unknown error'); return; }
    setSuccess(`OT recorded: ${otPreview.otHours}h × $${otPreview.otRate.toFixed(2)}/h = $${otPreview.otTotal.toFixed(2)}`);
    setHoursWorked(''); setDayRate('');
  }

  async function handleExpenseSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!expenseDesc.trim() || !expenseAmount) { setError('Please fill in all required fields.'); return; }
    setSubmitting(true); setError(null); setSuccess(null);

    const fd = new FormData();
    fd.set('booking_id', bookingId);
    fd.set('quote_version_id', quoteVersionId);
    fd.set('line_type', expenseType);
    fd.set('description', expenseDesc);
    fd.set('amount', expenseAmount);
    if (expenseNotes) fd.set('notes', expenseNotes);

    const result = await addExpenseLineAction(fd);
    setSubmitting(false);
    if ('error' in result) { setError(result.error ?? 'Unknown error'); return; }
    setSuccess(`Expense added: ${expenseDesc} — $${parseFloat(expenseAmount).toFixed(2)}`);
    setExpenseDesc(''); setExpenseAmount(''); setExpenseNotes('');
  }

  if (isLocked) {
    return (
      <section className="rounded-lg border p-4" style={{ background: PALETTE.surface, borderColor: PALETTE.border }}>
        <h3 className="text-xs font-semibold uppercase tracking-wide mb-1" style={{ color: PALETTE.muted }}>OT & Expenses</h3>
        <p className="text-xs" style={{ color: PALETTE.muted }}>Window closed — financial state is locked.</p>
      </section>
    );
  }

  return (
    <section className="rounded-lg border p-4 space-y-4" style={{ background: PALETTE.surface, borderColor: PALETTE.warning + '66' }}>
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-xs font-semibold uppercase tracking-wide" style={{ color: PALETTE.warning }}>OT & Expense Entry</h3>
          <p className="text-[11px] mt-0.5" style={{ color: PALETTE.muted }}>
            Window {windowExpired ? 'closed' : `open — closes ${windowEndDate.toLocaleString('en-AU', { dateStyle: 'medium', timeStyle: 'short' })}`}
            {!windowExpired && hoursLeft < 24 && (
              <span style={{ color: PALETTE.danger }}> · {Math.round(hoursLeft)}h left</span>
            )}
          </p>
        </div>
        {!windowExpired && (
          <div className="flex rounded border overflow-hidden" style={{ borderColor: PALETTE.border }}>
            {(['ot', 'expense'] as const).map((m) => (
              <button
                key={m}
                onClick={() => { setMode(m); setError(null); setSuccess(null); }}
                className="px-3 py-1 text-xs font-medium"
                style={{
                  background: mode === m ? PALETTE.accent : 'transparent',
                  color: mode === m ? PALETTE.bg : PALETTE.muted,
                  border: 'none', cursor: 'pointer',
                }}
              >
                {m === 'ot' ? 'Overtime' : 'Expense'}
              </button>
            ))}
          </div>
        )}
      </div>

      {!windowExpired && mode === 'ot' && (
        <form onSubmit={handleOTSubmit} className="space-y-3">
          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <label className={labelClass} style={labelStyle}>Crew Member</label>
              <select value={crewId} onChange={(e) => {
                setCrewId(e.target.value);
                const member = bookingCrew.find((c) => c.crew_id === e.target.value);
                if (member?.day_rate) setDayRate(String(member.day_rate));
              }} className={inputClass} style={inputStyle}>
                <option value="">— Select crew —</option>
                {bookingCrew.map((c) => (
                  <option key={c.crew_id} value={c.crew_id}>
                    {c.crew?.name ?? c.crew_id} {c.day_rate ? `($${c.day_rate}/day)` : ''}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className={labelClass} style={labelStyle}>Day Rate ($)</label>
              <input
                type="number" step="0.01" min="0"
                value={dayRate} onChange={(e) => setDayRate(e.target.value)}
                className={inputClass} style={inputStyle} placeholder="e.g. 700"
              />
            </div>
            <div>
              <label className={labelClass} style={labelStyle}>Hours Worked</label>
              <input
                type="number" step="0.25" min="0"
                value={hoursWorked} onChange={(e) => setHoursWorked(e.target.value)}
                className={inputClass} style={inputStyle} placeholder="e.g. 12.5"
              />
            </div>
            <div className="flex items-center gap-2 pt-5">
              <input
                type="checkbox" id="is-half-day"
                checked={isHalfDay} onChange={(e) => setIsHalfDay(e.target.checked)}
              />
              <label htmlFor="is-half-day" className="text-xs" style={{ color: PALETTE.text }}>
                Half-day rate (≤5h threshold)
              </label>
            </div>
          </div>

          {/* OT preview */}
          {hoursWorked && dayRate && (
            <div className="rounded px-3 py-2 text-xs" style={{ background: otPreview ? `${PALETTE.warning}15` : `${PALETTE.muted}15`, color: PALETTE.text }}>
              {otPreview ? (
                <>
                  <span style={{ color: PALETTE.warning, fontWeight: 600 }}>OT: </span>
                  {otPreview.otHours}h × ${otPreview.otRate.toFixed(2)}/h (1.5× crew rate)
                  {' = '}
                  <span style={{ fontWeight: 600 }}>${otPreview.otTotal.toFixed(2)}</span>
                  <span style={{ color: PALETTE.muted }}> + ASF 15% + GST 10%</span>
                </>
              ) : (
                <span style={{ color: PALETTE.muted }}>
                  No overtime — {parseFloat(hoursWorked).toFixed(1)}h is within the {isHalfDay ? '5h half-day' : '10h full-day'} threshold (+30min grace).
                </span>
              )}
            </div>
          )}

          <button
            type="submit" disabled={submitting || !otPreview}
            className="rounded px-4 py-1.5 text-xs font-medium disabled:opacity-40"
            style={{ background: PALETTE.accent, color: PALETTE.bg, border: 'none', cursor: 'pointer' }}
          >
            {submitting ? 'Adding...' : 'Add OT Line'}
          </button>
        </form>
      )}

      {!windowExpired && mode === 'expense' && (
        <form onSubmit={handleExpenseSubmit} className="space-y-3">
          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <label className={labelClass} style={labelStyle}>Expense Type</label>
              <select value={expenseType} onChange={(e) => setExpenseType(e.target.value)} className={inputClass} style={inputStyle}>
                {EXPENSE_TYPES.map((t) => (
                  <option key={t.value} value={t.value}>{t.label}</option>
                ))}
              </select>
            </div>
            <div>
              <label className={labelClass} style={labelStyle}>Amount ($)</label>
              <input
                type="number" step="0.01" min="0" required
                value={expenseAmount} onChange={(e) => setExpenseAmount(e.target.value)}
                className={inputClass} style={inputStyle} placeholder="0.00"
              />
            </div>
            <div className="sm:col-span-2">
              <label className={labelClass} style={labelStyle}>Description *</label>
              <input
                required value={expenseDesc} onChange={(e) => setExpenseDesc(e.target.value)}
                className={inputClass} style={inputStyle} placeholder="e.g. Lunch for 6 crew"
              />
            </div>
            <div className="sm:col-span-2">
              <label className={labelClass} style={labelStyle}>Notes (optional)</label>
              <input
                value={expenseNotes} onChange={(e) => setExpenseNotes(e.target.value)}
                className={inputClass} style={inputStyle} placeholder="e.g. Receipt #123, reimbursable"
              />
            </div>
          </div>
          <button
            type="submit" disabled={submitting}
            className="rounded px-4 py-1.5 text-xs font-medium disabled:opacity-40"
            style={{ background: PALETTE.accent, color: PALETTE.bg, border: 'none', cursor: 'pointer' }}
          >
            {submitting ? 'Adding...' : 'Add Expense'}
          </button>
        </form>
      )}

      {error && (
        <div className="rounded px-3 py-2 text-xs" style={{ color: PALETTE.danger, background: `${PALETTE.danger}11`, border: `1px solid ${PALETTE.danger}44` }}>
          {error}
        </div>
      )}
      {success && (
        <div className="rounded px-3 py-2 text-xs" style={{ color: PALETTE.success, background: `${PALETTE.success}11`, border: `1px solid ${PALETTE.success}44` }}>
          ✓ {success}
        </div>
      )}
    </section>
  );
}
