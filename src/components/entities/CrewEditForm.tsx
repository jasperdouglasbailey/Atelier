'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { updateCrewAction } from '@/app/actions/entities';
import { PALETTE, CREW_ROLES, PREFERRED_COMMS_OPTIONS, PREFERRED_COMMS_LABELS } from '@/lib/utils/constants';
import type { Crew } from '@/lib/types/database';

type Props = { crew: Crew };

const TIER_OPTIONS = [
  { value: 'preferred_core', label: 'Preferred Core' },
  { value: 'regular_freelance', label: 'Regular Freelance' },
  { value: 'never_again', label: 'Never Again' },
];

export default function CrewEditForm({ crew }: Props) {
  const router = useRouter();
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setSaving(true);
    setError(null);

    const fd = new FormData(e.currentTarget);
    const result = await updateCrewAction(crew.id, fd);

    setSaving(false);
    if ('error' in result && result.error) {
      setError(result.error);
      return;
    }
    router.push(`/crew/${crew.id}`);
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
          <input name="name" required defaultValue={crew.name} style={inputStyle} />
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label style={labelStyle}>Primary Role</label>
            <select name="primary_role" defaultValue={crew.primary_role ?? ''} style={inputStyle}>
              <option value="">— Select —</option>
              {CREW_ROLES.map((r) => (
                <option key={r} value={r}>{r.replace(/_/g, ' ')}</option>
              ))}
            </select>
          </div>
          <div>
            <label style={labelStyle}>Tier</label>
            <select name="tier" defaultValue={crew.tier} style={inputStyle}>
              {TIER_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>{o.label}</option>
              ))}
            </select>
          </div>
        </div>
      </section>

      {/* Contact */}
      <section className="rounded-lg border p-4 space-y-4" style={{ background: PALETTE.surface, borderColor: PALETTE.border }}>
        <h3 className="text-xs font-semibold uppercase tracking-wide" style={{ color: PALETTE.muted }}>Contact</h3>

        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label style={labelStyle}>Email</label>
            <input name="email" type="email" defaultValue={crew.email ?? ''} style={inputStyle} />
          </div>
          <div>
            <label style={labelStyle}>Mobile</label>
            <input name="mobile" defaultValue={crew.mobile ?? ''} style={inputStyle} />
          </div>
        </div>

        <div>
          <label style={labelStyle}>Preferred Comms</label>
          <select name="preferred_comms" defaultValue={crew.preferred_comms ?? ''} style={{ ...inputStyle, maxWidth: 240 }}>
            <option value="">— Not set —</option>
            {PREFERRED_COMMS_OPTIONS.map((c) => (
              <option key={c} value={c}>{PREFERRED_COMMS_LABELS[c]}</option>
            ))}
          </select>
        </div>
      </section>

      {/* Business / Finance */}
      <section className="rounded-lg border p-4 space-y-4" style={{ background: PALETTE.surface, borderColor: PALETTE.border }}>
        <h3 className="text-xs font-semibold uppercase tracking-wide" style={{ color: PALETTE.muted }}>Business & Finance</h3>

        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label style={labelStyle}>ABN</label>
            <input name="abn" defaultValue={crew.abn ?? ''} style={inputStyle} placeholder="XX XXX XXX XXX" />
          </div>
          <div>
            <label style={labelStyle}>GST Registered</label>
            <select name="gst_registered" defaultValue={crew.gst_registered ? 'true' : 'false'} style={inputStyle}>
              <option value="false">No</option>
              <option value="true">Yes</option>
            </select>
          </div>
        </div>

        <div>
          <label style={labelStyle}>Default Day Rate (AUD)</label>
          <input
            name="default_day_rate"
            type="number"
            min={0}
            step={50}
            defaultValue={crew.default_day_rate ?? ''}
            style={{ ...inputStyle, width: 160 }}
            placeholder="e.g. 800"
          />
        </div>
      </section>

      {/* Super */}
      <section className="rounded-lg border p-4 space-y-4" style={{ background: PALETTE.surface, borderColor: PALETTE.border }}>
        <h3 className="text-xs font-semibold uppercase tracking-wide" style={{ color: PALETTE.muted }}>Superannuation</h3>

        <div className="grid gap-4 sm:grid-cols-3">
          <div>
            <label style={labelStyle}>Fund Name</label>
            <input name="super_fund_name" defaultValue={crew.super_fund_name ?? ''} style={inputStyle} />
          </div>
          <div>
            <label style={labelStyle}>Member Number</label>
            <input name="super_member_number" defaultValue={crew.super_member_number ?? ''} style={inputStyle} />
          </div>
          <div>
            <label style={labelStyle}>USI</label>
            <input name="super_usi" defaultValue={crew.super_usi ?? ''} style={inputStyle} />
          </div>
        </div>
      </section>

      {/* Notes */}
      <section className="rounded-lg border p-4 space-y-4" style={{ background: PALETTE.surface, borderColor: PALETTE.border }}>
        <h3 className="text-xs font-semibold uppercase tracking-wide" style={{ color: PALETTE.muted }}>Notes</h3>
        <textarea
          name="notes"
          defaultValue={crew.notes ?? ''}
          rows={4}
          style={{ ...inputStyle, resize: 'vertical' }}
          placeholder="Internal notes about this crew member…"
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
          onClick={() => router.push(`/crew/${crew.id}`)}
          className="rounded px-5 py-2 text-sm font-medium"
          style={{ background: 'transparent', color: PALETTE.muted, border: `1px solid ${PALETTE.border}`, cursor: 'pointer' }}
        >
          Cancel
        </button>
      </div>
    </form>
  );
}
