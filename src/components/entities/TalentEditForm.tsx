'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { updateTalentAction } from '@/app/actions/entities';
import {
  PALETTE,
  ARTIST_DISCIPLINES, ARTIST_DISCIPLINE_LABELS,
  PREFERRED_COMMS_OPTIONS, PREFERRED_COMMS_LABELS,
} from '@/lib/utils/constants';
import type { Talent } from '@/lib/types/database';

type Props = { talent: Talent };

const REPRESENTATION_OPTIONS = [
  { value: 'exclusive', label: 'Exclusive' },
  { value: 'non_exclusive', label: 'Non-Exclusive' },
  { value: 'direct', label: 'Direct (No Agency)' },
];

const ENTITY_TYPE_OPTIONS = [
  { value: '', label: '— Select —' },
  { value: 'sole_trader', label: 'Sole Trader' },
  { value: 'company', label: 'Company' },
  { value: 'partnership', label: 'Partnership' },
  { value: 'individual', label: 'Individual (no ABN)' },
];

export default function TalentEditForm({ talent }: Props) {
  const router = useRouter();
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setSaving(true);
    setError(null);

    const fd = new FormData(e.currentTarget);
    const result = await updateTalentAction(talent.id, fd);

    setSaving(false);
    if ('error' in result && result.error) {
      setError(result.error);
      return;
    }
    router.push(`/talent/${talent.id}`);
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
      {/* Identity */}
      <section className="rounded-lg border p-4 space-y-4" style={{ background: PALETTE.surface, borderColor: PALETTE.border }}>
        <h3 className="text-xs font-semibold uppercase tracking-wide" style={{ color: PALETTE.muted }}>Identity</h3>

        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label style={labelStyle}>Legal Name *</label>
            <input name="legal_name" required defaultValue={talent.legal_name} style={inputStyle} />
          </div>
          <div>
            <label style={labelStyle}>Working Name *</label>
            <input name="working_name" required defaultValue={talent.working_name} style={inputStyle} />
          </div>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label style={labelStyle}>Discipline *</label>
            <select name="discipline" required defaultValue={talent.discipline} style={inputStyle}>
              {ARTIST_DISCIPLINES.map((d) => (
                <option key={d} value={d}>{ARTIST_DISCIPLINE_LABELS[d]}</option>
              ))}
            </select>
          </div>
          <div>
            <label style={labelStyle}>Specialty / Sub-niche</label>
            <input
              name="specialty"
              defaultValue={talent.specialty ?? ''}
              style={inputStyle}
              placeholder="e.g. fashion editorial, product still life, swimwear"
            />
          </div>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label style={labelStyle}>Pronouns</label>
            <input name="pronouns" defaultValue={talent.pronouns ?? ''} style={inputStyle} placeholder="they/them" />
          </div>
          <div>
            <label style={labelStyle}>Representation</label>
            <select name="representation_status" defaultValue={talent.representation_status ?? 'exclusive'} style={inputStyle}>
              {REPRESENTATION_OPTIONS.map((o) => (
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
            <input name="email" type="email" defaultValue={talent.email ?? ''} style={inputStyle} />
          </div>
          <div>
            <label style={labelStyle}>Mobile</label>
            <input name="mobile" defaultValue={talent.mobile ?? ''} style={inputStyle} />
          </div>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label style={labelStyle}>Instagram</label>
            <input name="instagram" defaultValue={talent.instagram ?? ''} style={inputStyle} placeholder="@handle" />
          </div>
          <div>
            <label style={labelStyle}>Website</label>
            <input name="website" defaultValue={talent.website ?? ''} style={inputStyle} placeholder="https://" />
          </div>
        </div>

        <div>
          <label style={labelStyle}>Preferred Comms</label>
          <select name="preferred_comms" defaultValue={talent.preferred_comms ?? ''} style={{ ...inputStyle, maxWidth: 240 }}>
            <option value="">— Not set —</option>
            {PREFERRED_COMMS_OPTIONS.map((c) => (
              <option key={c} value={c}>{PREFERRED_COMMS_LABELS[c]}</option>
            ))}
          </select>
        </div>
      </section>

      {/* Rates */}
      <section className="rounded-lg border p-4 space-y-4" style={{ background: PALETTE.surface, borderColor: PALETTE.border }}>
        <h3 className="text-xs font-semibold uppercase tracking-wide" style={{ color: PALETTE.muted }}>Rates</h3>
        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label style={labelStyle}>Default Day Rate (AUD, ex. GST)</label>
            <input
              name="default_day_rate"
              type="number"
              step="0.01"
              min="0"
              defaultValue={talent.default_day_rate ?? ''}
              style={inputStyle}
              placeholder="e.g. 3500"
            />
            <p className="mt-1" style={{ fontSize: 10, color: PALETTE.muted }}>
              Pre-fills the day rate input when adding this artist to a booking.
            </p>
          </div>
        </div>
      </section>

      {/* Business */}
      <section className="rounded-lg border p-4 space-y-4" style={{ background: PALETTE.surface, borderColor: PALETTE.border }}>
        <h3 className="text-xs font-semibold uppercase tracking-wide" style={{ color: PALETTE.muted }}>Business</h3>

        <div className="grid gap-4 sm:grid-cols-3">
          <div>
            <label style={labelStyle}>ABN</label>
            <input name="abn" defaultValue={talent.abn ?? ''} style={inputStyle} placeholder="XX XXX XXX XXX" />
          </div>
          <div>
            <label style={labelStyle}>GST Registered</label>
            <select name="gst_registered" defaultValue={talent.gst_registered ? 'true' : 'false'} style={inputStyle}>
              <option value="false">No</option>
              <option value="true">Yes</option>
            </select>
          </div>
          <div>
            <label style={labelStyle}>Entity Type</label>
            <select name="entity_type" defaultValue={talent.entity_type ?? ''} style={inputStyle}>
              {ENTITY_TYPE_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>{o.label}</option>
              ))}
            </select>
          </div>
        </div>
      </section>

      {/* Notes */}
      <section className="rounded-lg border p-4 space-y-4" style={{ background: PALETTE.surface, borderColor: PALETTE.border }}>
        <h3 className="text-xs font-semibold uppercase tracking-wide" style={{ color: PALETTE.muted }}>Notes</h3>
        <textarea
          name="notes"
          defaultValue={talent.notes ?? ''}
          rows={4}
          style={{ ...inputStyle, resize: 'vertical' }}
          placeholder="Internal notes about this talent…"
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
          onClick={() => router.push(`/talent/${talent.id}`)}
          className="rounded px-5 py-2 text-sm font-medium"
          style={{ background: 'transparent', color: PALETTE.muted, border: `1px solid ${PALETTE.border}`, cursor: 'pointer' }}
        >
          Cancel
        </button>
      </div>
    </form>
  );
}
