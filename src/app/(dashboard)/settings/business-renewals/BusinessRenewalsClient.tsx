'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import {
  createBusinessRenewalAction, updateBusinessRenewalAction, deleteBusinessRenewalAction,
} from '@/app/actions/business-renewals';
import { RENEWAL_TYPE_OPTIONS, type BusinessRenewalRow, type ExpiryStatus, EXPIRY_DANGER_DAYS, EXPIRY_WARN_DAYS } from '@/lib/data/business-renewals-types';
import { PALETTE } from '@/lib/utils/constants';
import { formatDate } from '@/lib/utils/format';

type Props = { rows: BusinessRenewalRow[] };

function statusColour(status: ExpiryStatus): string {
  switch (status) {
    case 'expired':
    case 'danger':  return PALETTE.danger;
    case 'warning': return PALETTE.warning;
    case 'ok':      return PALETTE.success;
  }
}

function statusLabel(row: BusinessRenewalRow): string {
  if (row.daysUntil <= 0) return `Expired ${formatDate(row.expires_at)}`;
  if (row.daysUntil <= EXPIRY_WARN_DAYS) return `${formatDate(row.expires_at)} (${row.daysUntil}d)`;
  return formatDate(row.expires_at);
}

function typeLabel(type: string): string {
  return RENEWAL_TYPE_OPTIONS.find((o) => o.value === type)?.label ?? type;
}

export default function BusinessRenewalsClient({ rows }: Props) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [showAdd, setShowAdd] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  function refresh() { router.refresh(); }

  async function handleCreate(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    const fd = new FormData(e.currentTarget);
    startTransition(async () => {
      const result = await createBusinessRenewalAction(fd);
      if ('error' in result && result.error) { setError(result.error); return; }
      setShowAdd(false);
      refresh();
    });
  }

  async function handleUpdate(id: string, e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    const fd = new FormData(e.currentTarget);
    startTransition(async () => {
      const result = await updateBusinessRenewalAction(id, fd);
      if ('error' in result && result.error) { setError(result.error); return; }
      setEditingId(null);
      refresh();
    });
  }

  async function handleDelete(id: string) {
    setError(null);
    startTransition(async () => {
      const result = await deleteBusinessRenewalAction(id);
      if ('error' in result && result.error) { setError(result.error); return; }
      setConfirmDelete(null);
      refresh();
    });
  }

  const inputStyle: React.CSSProperties = {
    background: PALETTE.bg, color: PALETTE.text,
    border: `1px solid ${PALETTE.border}`, borderRadius: 6,
    padding: '6px 10px', fontSize: 13, width: '100%', outline: 'none',
  };
  const labelStyle: React.CSSProperties = {
    color: PALETTE.muted, fontSize: 10, fontWeight: 600,
    textTransform: 'uppercase', letterSpacing: '0.06em',
    display: 'block', marginBottom: 4,
  };

  return (
    <div className="space-y-4">
      {error && (
        <div className="rounded px-3 py-2 text-xs" style={{ background: `${PALETTE.danger}15`, color: PALETTE.danger }}>
          {error}
        </div>
      )}

      <div className="flex justify-between items-center">
        <div className="flex items-center gap-3 text-[11px]" style={{ color: PALETTE.muted }}>
          <span style={{ color: PALETTE.danger }}>■ Expired / ≤{EXPIRY_DANGER_DAYS}d</span>
          <span style={{ color: PALETTE.warning }}>■ ≤{EXPIRY_WARN_DAYS}d</span>
          <span style={{ color: PALETTE.success }}>■ OK</span>
        </div>
        {!showAdd && (
          <button
            onClick={() => { setShowAdd(true); setError(null); }}
            className="rounded px-3 py-1.5 text-xs font-medium"
            style={{ background: PALETTE.accent, color: PALETTE.bg, border: 'none', cursor: 'pointer' }}
          >
            + Add renewal
          </button>
        )}
      </div>

      {showAdd && (
        <form
          onSubmit={handleCreate}
          className="rounded-lg border p-4 space-y-3"
          style={{ background: PALETTE.surface, borderColor: PALETTE.border }}
        >
          <h3 className="text-xs font-semibold uppercase tracking-wide" style={{ color: PALETTE.muted }}>
            New renewal
          </h3>
          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <label style={labelStyle}>Type *</label>
              <select name="type" required style={inputStyle} defaultValue="">
                <option value="" disabled>— Select —</option>
                {RENEWAL_TYPE_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
              </select>
            </div>
            <div>
              <label style={labelStyle}>Expires *</label>
              <input name="expires_at" type="date" required style={inputStyle} />
            </div>
          </div>
          <div>
            <label style={labelStyle}>Label *</label>
            <input name="label" required style={inputStyle} placeholder="e.g. AON Public Liability — $20M cover" />
          </div>
          <div>
            <label style={labelStyle}>Notes</label>
            <textarea name="notes" rows={2} style={{ ...inputStyle, resize: 'vertical' }} placeholder="Provider, premium, last claim, …" />
          </div>
          <div className="flex gap-2">
            <button
              type="submit"
              disabled={pending}
              className="rounded px-4 py-1.5 text-xs font-medium disabled:opacity-50"
              style={{ background: PALETTE.accent, color: PALETTE.bg, border: 'none', cursor: 'pointer' }}
            >
              {pending ? 'Saving…' : 'Save'}
            </button>
            <button
              type="button"
              onClick={() => { setShowAdd(false); setError(null); }}
              className="rounded px-4 py-1.5 text-xs"
              style={{ background: 'transparent', color: PALETTE.muted, border: `1px solid ${PALETTE.border}`, cursor: 'pointer' }}
            >
              Cancel
            </button>
          </div>
        </form>
      )}

      <div className="rounded-lg border overflow-hidden" style={{ borderColor: PALETTE.border }}>
        <table className="w-full text-xs">
          <thead>
            <tr className="border-b" style={{ background: PALETTE.surface, borderColor: PALETTE.border }}>
              <th className="px-3 py-2 text-left font-semibold" style={{ color: PALETTE.muted }}>Type</th>
              <th className="px-3 py-2 text-left font-semibold" style={{ color: PALETTE.muted }}>Label</th>
              <th className="px-3 py-2 text-left font-semibold" style={{ color: PALETTE.muted }}>Expires</th>
              <th className="px-3 py-2 text-left font-semibold" style={{ color: PALETTE.muted }}>Notes</th>
              <th className="px-3 py-2 text-right font-semibold" style={{ color: PALETTE.muted }}></th>
            </tr>
          </thead>
          <tbody className="divide-y" style={{ borderColor: PALETTE.border }}>
            {rows.length === 0 && (
              <tr><td colSpan={5} className="px-3 py-6 text-center" style={{ color: PALETTE.muted }}>
                No renewals yet. Add public liability, professional indemnity, BAS quarterly, ASIC review, etc.
              </td></tr>
            )}
            {rows.map((r) => editingId === r.id ? (
              <tr key={r.id} style={{ background: `${PALETTE.accent}08` }}>
                <td colSpan={5} className="px-3 py-3">
                  <form onSubmit={(e) => handleUpdate(r.id, e)} className="space-y-2">
                    <div className="grid gap-2 sm:grid-cols-3">
                      <select name="type" defaultValue={r.type} style={inputStyle}>
                        {RENEWAL_TYPE_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
                        {!RENEWAL_TYPE_OPTIONS.some((o) => o.value === r.type) && (
                          <option value={r.type}>{r.type}</option>
                        )}
                      </select>
                      <input name="label" defaultValue={r.label} required style={inputStyle} />
                      <input name="expires_at" type="date" defaultValue={r.expires_at} required style={inputStyle} />
                    </div>
                    <textarea name="notes" defaultValue={r.notes ?? ''} rows={2} style={{ ...inputStyle, resize: 'vertical' }} />
                    <div className="flex gap-2">
                      <button type="submit" disabled={pending} className="rounded px-3 py-1 text-[11px]" style={{ background: PALETTE.accent, color: PALETTE.bg, border: 'none', cursor: 'pointer' }}>{pending ? 'Saving…' : 'Save'}</button>
                      <button type="button" onClick={() => setEditingId(null)} className="rounded px-3 py-1 text-[11px]" style={{ background: 'transparent', color: PALETTE.muted, border: `1px solid ${PALETTE.border}`, cursor: 'pointer' }}>Cancel</button>
                    </div>
                  </form>
                </td>
              </tr>
            ) : (
              <tr key={r.id}>
                <td className="px-3 py-2.5" style={{ color: PALETTE.muted }}>{typeLabel(r.type)}</td>
                <td className="px-3 py-2.5 font-medium" style={{ color: PALETTE.text }}>{r.label}</td>
                <td className="px-3 py-2.5">
                  <span style={{ color: statusColour(r.status) }}>{statusLabel(r)}</span>
                </td>
                <td className="px-3 py-2.5 max-w-[280px] truncate" style={{ color: PALETTE.muted }} title={r.notes ?? ''}>
                  {r.notes ?? '—'}
                </td>
                <td className="px-3 py-2.5 text-right whitespace-nowrap">
                  {confirmDelete === r.id ? (
                    <span className="inline-flex gap-2 items-center">
                      <span className="text-[11px]" style={{ color: PALETTE.danger }}>Delete?</span>
                      <button onClick={() => handleDelete(r.id)} disabled={pending} className="rounded px-2 py-0.5 text-[10px]" style={{ background: PALETTE.danger, color: '#fff', border: 'none', cursor: 'pointer' }}>{pending ? '…' : 'Yes'}</button>
                      <button onClick={() => setConfirmDelete(null)} className="rounded px-2 py-0.5 text-[10px]" style={{ background: 'transparent', color: PALETTE.muted, border: `1px solid ${PALETTE.border}`, cursor: 'pointer' }}>No</button>
                    </span>
                  ) : (
                    <span className="inline-flex gap-1">
                      <button onClick={() => setEditingId(r.id)} className="rounded px-2 py-0.5 text-[10px]" style={{ background: 'transparent', color: PALETTE.muted, border: `1px solid ${PALETTE.border}`, cursor: 'pointer' }}>Edit</button>
                      <button onClick={() => setConfirmDelete(r.id)} className="rounded px-2 py-0.5 text-[10px]" style={{ background: `${PALETTE.danger}15`, color: PALETTE.danger, border: `1px solid ${PALETTE.danger}40`, cursor: 'pointer' }}>Delete</button>
                    </span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
