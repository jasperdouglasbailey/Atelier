'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { updateClientAction } from '@/app/actions/entities';
import { PALETTE, PREFERRED_COMMS_OPTIONS, PREFERRED_COMMS_LABELS, COMMUNICATION_STYLE_OPTIONS, COMMUNICATION_STYLE_LABELS } from '@/lib/utils/constants';
import type { Client } from '@/lib/types/database';

type Props = { client: Client };

export default function ClientEditForm({ client }: Props) {
  const router = useRouter();
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setSaving(true);
    setError(null);

    const fd = new FormData(e.currentTarget);
    const result = await updateClientAction(client.id, fd);

    setSaving(false);
    if ('error' in result && result.error) {
      setError(result.error);
      return;
    }
    // router.push alone won't refetch the destination's server data when the
    // route is in the cache. router.refresh() forces the server components to
    // re-render with the latest data so saved changes appear without a reload.
    router.push(`/clients/${client.id}`);
    router.refresh();
  }

  const inputStyle = {
    background: PALETTE.bg,
    borderColor: PALETTE.border,
    color: PALETTE.text,
    border: `1px solid ${PALETTE.border}`,
    borderRadius: 6,
    padding: '6px 10px',
    fontSize: 13,
    width: '100%',
    outline: 'none',
  };

  const labelStyle = {
    color: PALETTE.muted,
    fontSize: 10,
    fontWeight: 600,
    textTransform: 'uppercase' as const,
    letterSpacing: '0.06em',
    display: 'block',
    marginBottom: 4,
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      {/* Basic info */}
      <section className="rounded-lg border p-4 space-y-4" style={{ background: PALETTE.surface, borderColor: PALETTE.border }}>
        <h3 className="text-xs font-semibold uppercase tracking-wide" style={{ color: PALETTE.muted }}>Basic Information</h3>

        <div>
          <label style={labelStyle}>Name *</label>
          <input
            name="name"
            required
            defaultValue={client.name}
            style={inputStyle}
          />
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label style={labelStyle}>Company</label>
            <input name="company" defaultValue={client.company ?? ''} style={inputStyle} />
          </div>
          <div>
            <label style={labelStyle}>ABN</label>
            <input name="abn" defaultValue={client.abn ?? ''} style={inputStyle} placeholder="XX XXX XXX XXX" />
          </div>
        </div>

        <div>
          <label style={labelStyle}>Type</label>
          <select
            name="is_creative_agency"
            defaultValue={client.is_creative_agency ? 'true' : 'false'}
            style={inputStyle}
          >
            <option value="false">Direct Client</option>
            <option value="true">Creative Agency</option>
          </select>
        </div>
      </section>

      {/* Contact */}
      <section className="rounded-lg border p-4 space-y-4" style={{ background: PALETTE.surface, borderColor: PALETTE.border }}>
        <h3 className="text-xs font-semibold uppercase tracking-wide" style={{ color: PALETTE.muted }}>Contact</h3>

        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label style={labelStyle}>Email</label>
            <input name="email" type="email" defaultValue={client.email ?? ''} style={inputStyle} />
          </div>
          <div>
            <label style={labelStyle}>Phone</label>
            <input name="phone" defaultValue={client.phone ?? ''} style={inputStyle} />
          </div>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label style={labelStyle}>Preferred Comms</label>
            <select name="preferred_comms" defaultValue={client.preferred_comms ?? ''} style={inputStyle}>
              <option value="">— Not set —</option>
              {PREFERRED_COMMS_OPTIONS.map((c) => (
                <option key={c} value={c}>{PREFERRED_COMMS_LABELS[c]}</option>
              ))}
            </select>
          </div>
          <div>
            <label style={labelStyle}>Email Tone</label>
            <select name="communication_style" defaultValue={client.communication_style ?? ''} style={inputStyle}>
              <option value="">— Default (casual) —</option>
              {COMMUNICATION_STYLE_OPTIONS.map((s) => (
                <option key={s} value={s}>{COMMUNICATION_STYLE_LABELS[s]}</option>
              ))}
            </select>
          </div>
        </div>
      </section>

      {/* Finance */}
      <section className="rounded-lg border p-4 space-y-4" style={{ background: PALETTE.surface, borderColor: PALETTE.border }}>
        <h3 className="text-xs font-semibold uppercase tracking-wide" style={{ color: PALETTE.muted }}>Finance</h3>

        <div>
          <label style={labelStyle}>Payment Terms (days)</label>
          <input
            name="payment_terms_days"
            type="number"
            min={0}
            max={180}
            defaultValue={client.payment_terms_days ?? ''}
            style={{ ...inputStyle, width: 120 }}
            placeholder="30"
          />
        </div>
      </section>

      {/* Notes */}
      <section className="rounded-lg border p-4 space-y-4" style={{ background: PALETTE.surface, borderColor: PALETTE.border }}>
        <h3 className="text-xs font-semibold uppercase tracking-wide" style={{ color: PALETTE.muted }}>Notes</h3>
        <textarea
          name="notes"
          defaultValue={client.notes ?? ''}
          rows={4}
          style={{ ...inputStyle, resize: 'vertical' }}
          placeholder="Internal notes about this client…"
        />
      </section>

      {error && (
        <div className="rounded px-3 py-2 text-xs" style={{ color: PALETTE.danger, background: `${PALETTE.danger}15` }}>
          {error}
        </div>
      )}

      <div className="flex gap-3">
        <button
          type="submit"
          disabled={saving}
          className="rounded px-5 py-2 text-sm font-medium disabled:opacity-50"
          style={{ background: PALETTE.accent, color: PALETTE.bg, border: 'none', cursor: 'pointer' }}
        >
          {saving ? 'Saving…' : 'Save Changes'}
        </button>
        <button
          type="button"
          onClick={() => router.push(`/clients/${client.id}`)}
          className="rounded px-5 py-2 text-sm font-medium"
          style={{ background: 'transparent', color: PALETTE.muted, border: `1px solid ${PALETTE.border}`, cursor: 'pointer' }}
        >
          Cancel
        </button>
      </div>
    </form>
  );
}
