'use client';

import { useState } from 'react';
import { createClientAction, createBrandAction } from '@/app/actions/entities';
import { PALETTE } from '@/lib/utils/constants';

const inputClass = 'w-full rounded-md border bg-transparent px-3 py-2 text-sm';
const inputStyle = { borderColor: PALETTE.border, color: PALETTE.text, background: PALETTE.bg };
const labelClass = 'block text-xs font-medium mb-1';
const labelStyle = { color: PALETTE.muted };

type Props =
  | { type: 'client'; onCreated: (id: string, name: string, company: string) => void; onCancel: () => void }
  | { type: 'brand'; onCreated: (id: string, name: string, company: string) => void; onCancel: () => void };

export default function QuickCreateForm({ type, onCreated, onCancel }: Props) {
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setSaving(true);
    setErr(null);
    const fd = new FormData(e.currentTarget);
    const name = (fd.get('name') as string) ?? '';
    const company = (fd.get('company') as string) ?? '';

    if (type === 'client') {
      const result = await createClientAction(fd);
      if ('error' in result) { setErr(result.error ?? 'Failed'); setSaving(false); return; }
      onCreated(result.id, name, company);
    } else {
      const result = await createBrandAction(fd);
      if ('error' in result) { setErr(result.error ?? 'Failed'); setSaving(false); return; }
      onCreated(result.id, result.name, '');
    }
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="mt-2 rounded-md border p-3 space-y-2"
      style={{ borderColor: PALETTE.accent, background: `${PALETTE.accent}0a` }}
    >
      <p className="text-[11px] font-semibold uppercase tracking-wide" style={{ color: PALETTE.accent }}>
        New {type === 'client' ? 'Client' : 'Brand'}
      </p>
      {err && <p className="text-xs" style={{ color: PALETTE.danger }}>{err}</p>}
      {type === 'client' ? (
        <>
          <div className="grid gap-2 sm:grid-cols-2">
            <div>
              <label className={labelClass} style={labelStyle}>Name *</label>
              <input name="name" required className={inputClass} style={inputStyle} placeholder="Contact name" />
            </div>
            <div>
              <label className={labelClass} style={labelStyle}>Company</label>
              <input name="company" className={inputClass} style={inputStyle} placeholder="e.g. AJE" />
            </div>
          </div>
          <div className="grid gap-2 sm:grid-cols-2">
            <div>
              <label className={labelClass} style={labelStyle}>Email</label>
              <input name="email" type="email" className={inputClass} style={inputStyle} />
            </div>
            <div>
              <label className={labelClass} style={labelStyle}>Phone</label>
              <input name="phone" className={inputClass} style={inputStyle} />
            </div>
          </div>
        </>
      ) : (
        <div>
          <label className={labelClass} style={labelStyle}>Brand Name *</label>
          <input name="name" required className={inputClass} style={inputStyle} placeholder="e.g. AJE" />
        </div>
      )}
      <div className="flex gap-2 pt-1">
        <button
          type="submit"
          disabled={saving}
          className="rounded px-3 py-1.5 text-xs font-medium disabled:opacity-50"
          style={{ background: PALETTE.accent, color: PALETTE.bg }}
        >
          {saving ? 'Saving…' : `Add ${type === 'client' ? 'client' : 'brand'}`}
        </button>
        <button
          type="button"
          onClick={onCancel}
          className="rounded px-3 py-1.5 text-xs"
          style={{ color: PALETTE.muted, border: `1px solid ${PALETTE.border}` }}
        >
          Cancel
        </button>
      </div>
    </form>
  );
}
