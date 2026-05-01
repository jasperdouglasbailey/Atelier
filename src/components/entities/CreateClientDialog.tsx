'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { createClientAction } from '@/app/actions/entities';
import { PALETTE } from '@/lib/utils/constants';

const inputClass = 'w-full rounded-md border bg-transparent px-3 py-2 text-sm';
const inputStyle = { borderColor: PALETTE.border, color: PALETTE.text, background: PALETTE.bg };

export default function CreateClientDialog() {
  const [open, setOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const router = useRouter();

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setSubmitting(true);
    const fd = new FormData(e.currentTarget);
    const result = await createClientAction(fd);
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
        + Add Client
      </button>
    );
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center" style={{ background: 'rgba(0,0,0,0.6)' }}>
      <div className="w-full max-w-md rounded-lg border p-6" style={{ background: PALETTE.surface, borderColor: PALETTE.border }}>
        <h2 className="mb-4 text-sm font-semibold" style={{ color: PALETTE.text }}>Add Client</h2>
        <form onSubmit={handleSubmit} className="space-y-3">
          <input name="name" required placeholder="Contact name *" className={inputClass} style={inputStyle} />
          <input name="company" placeholder="Company name" className={inputClass} style={inputStyle} />
          <input name="email" type="email" placeholder="Email" className={inputClass} style={inputStyle} />
          <input name="phone" placeholder="Phone" className={inputClass} style={inputStyle} />
          <input name="abn" placeholder="ABN" className={inputClass} style={inputStyle} />
          <input name="payment_terms_days" type="number" min="0" placeholder="Payment terms (days, default 30)" className={inputClass} style={inputStyle} />
          <div className="flex items-center gap-2">
            <input name="is_creative_agency" type="checkbox" value="true" id="is_agency" />
            <label htmlFor="is_agency" className="text-xs" style={{ color: PALETTE.muted }}>This is a creative agency</label>
          </div>
          <textarea name="notes" rows={2} placeholder="Notes (internal)" className={inputClass} style={inputStyle} />
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
