'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { createCrewAction } from '@/app/actions/entities';
import { PALETTE, CREW_TIERS, CREW_TIER_LABELS, CREW_ROLES } from '@/lib/utils/constants';
import { humanise } from '@/lib/utils/humanise';

const inputClass = 'w-full rounded-md border bg-transparent px-3 py-2 text-sm';
const inputStyle = { borderColor: PALETTE.border, color: PALETTE.text, background: PALETTE.bg };

export default function CreateCrewDialog() {
  const [open, setOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const router = useRouter();

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setSubmitting(true);
    const fd = new FormData(e.currentTarget);
    const result = await createCrewAction(fd);
    if ('error' in result) {
      alert(result.error);
      setSubmitting(false);
    } else {
      setOpen(false);
      setSubmitting(false);
      router.refresh();
    }
  }

  if (!open) {
    return (
      <button onClick={() => setOpen(true)} className="rounded-md px-4 py-2 text-xs font-medium" style={{ background: PALETTE.accent, color: PALETTE.bg }}>
        + Add Crew
      </button>
    );
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center" style={{ background: 'rgba(0,0,0,0.6)' }}>
      <div className="w-full max-w-md rounded-lg border p-6" style={{ background: PALETTE.surface, borderColor: PALETTE.border }}>
        <h2 className="mb-4 text-sm font-semibold" style={{ color: PALETTE.text }}>Add Crew Member</h2>
        <form onSubmit={handleSubmit} className="space-y-3">
          <input name="name" required placeholder="Full name *" className={inputClass} style={inputStyle} />
          <input name="email" type="email" placeholder="Email" className={inputClass} style={inputStyle} />
          <input name="mobile" placeholder="Mobile" className={inputClass} style={inputStyle} />
          <select name="primary_role" className={inputClass} style={inputStyle}>
            <option value="">— Role —</option>
            {CREW_ROLES.map((r) => (
              <option key={r} value={r}>{humanise(r)}</option>
            ))}
          </select>
          <select name="tier" className={inputClass} style={inputStyle} defaultValue="regular_freelance">
            {CREW_TIERS.map((t) => (
              <option key={t} value={t}>{CREW_TIER_LABELS[t]}</option>
            ))}
          </select>
          <input name="default_day_rate" type="number" min="0" step="0.01" placeholder="Default day rate ($)" className={inputClass} style={inputStyle} />
          <input name="abn" placeholder="ABN" className={inputClass} style={inputStyle} />
          <div className="flex items-center gap-2">
            <input name="gst_registered" type="checkbox" value="true" id="crew_gst" />
            <label htmlFor="crew_gst" className="text-xs" style={{ color: PALETTE.muted }}>GST registered</label>
          </div>
          <div className="flex gap-2 pt-2">
            <button type="submit" disabled={submitting} className="rounded-md px-4 py-2 text-xs font-medium disabled:opacity-50" style={{ background: PALETTE.accent, color: PALETTE.bg }}>
              {submitting ? 'Adding...' : 'Add'}
            </button>
            <button type="button" onClick={() => setOpen(false)} className="rounded-md border px-4 py-2 text-xs" style={{ borderColor: PALETTE.border, color: PALETTE.muted }}>
              Cancel
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
