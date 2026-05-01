'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { createBookingAction } from '@/app/actions/bookings';
import { SHOOT_TIERS, SHOOT_TIER_LABELS, PALETTE } from '@/lib/utils/constants';
import type { Client, Brand } from '@/lib/types/database';

type Props = {
  clients: Client[];
  brands: Brand[];
};

const inputClass = 'w-full rounded-md border bg-transparent px-3 py-2 text-sm';
const inputStyle = { borderColor: PALETTE.border, color: PALETTE.text, background: PALETTE.bg };
const labelClass = 'block text-xs font-medium mb-1';
const labelStyle = { color: PALETTE.muted };

export default function BookingForm({ clients, brands }: Props) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    const formData = new FormData(e.currentTarget);
    const result = await createBookingAction(formData);
    if ('error' in result) {
      setError(result.error ?? 'Unknown error');
      setSubmitting(false);
    } else {
      router.push(`/bookings/${result.id}`);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      {error && (
        <div className="rounded-md border px-4 py-3 text-sm" style={{ borderColor: PALETTE.danger, color: PALETTE.danger, background: `${PALETTE.danger}11` }}>
          {error}
        </div>
      )}

      {/* Project name */}
      <div>
        <label className={labelClass} style={labelStyle}>Project Name *</label>
        <input name="title" required className={inputClass} style={inputStyle} placeholder="e.g. AJE Spring/Summer Campaign" />
      </div>

      {/* Tier */}
      <div>
        <label className={labelClass} style={labelStyle}>Shoot Tier *</label>
        <select name="tier" required className={inputClass} style={inputStyle} defaultValue="content">
          {SHOOT_TIERS.map((t) => (
            <option key={t} value={t}>{SHOOT_TIER_LABELS[t]}</option>
          ))}
        </select>
      </div>

      {/* Client & Brand */}
      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <label className={labelClass} style={labelStyle}>Client (Billing)</label>
          <select name="client_id" className={inputClass} style={inputStyle}>
            <option value="">— Select —</option>
            {clients.map((c) => (
              <option key={c.id} value={c.id}>{c.name}{c.company ? ` (${c.company})` : ''}</option>
            ))}
          </select>
        </div>
        <div>
          <label className={labelClass} style={labelStyle}>End Brand</label>
          <select name="brand_id" className={inputClass} style={inputStyle}>
            <option value="">— Select —</option>
            {brands.map((b) => (
              <option key={b.id} value={b.id}>{b.name}</option>
            ))}
          </select>
        </div>
      </div>

      {/* Creative agency */}
      <div>
        <label className={labelClass} style={labelStyle}>Creative Agency (if different from billing client)</label>
        <select name="creative_agency_id" className={inputClass} style={inputStyle}>
          <option value="">— None —</option>
          {clients.filter((c) => c.is_creative_agency).map((c) => (
            <option key={c.id} value={c.id}>{c.name}</option>
          ))}
        </select>
      </div>

      {/* Location & dates */}
      <div>
        <label className={labelClass} style={labelStyle}>Shoot Location</label>
        <input name="shoot_location" className={inputClass} style={inputStyle} placeholder="e.g. Studio 301, Surry Hills" />
      </div>

      <div className="grid gap-4 sm:grid-cols-3">
        <div>
          <label className={labelClass} style={labelStyle}>Shoot Start Date</label>
          <input name="shoot_date_start" type="date" className={inputClass} style={inputStyle} />
        </div>
        <div>
          <label className={labelClass} style={labelStyle}>Shoot End Date</label>
          <input name="shoot_date_end" type="date" className={inputClass} style={inputStyle} />
          <p className="mt-0.5 text-[10px]" style={{ color: PALETTE.muted }}>Leave blank for single-day shoot</p>
        </div>
        <div>
          <label className={labelClass} style={labelStyle}>Date Notes (free text)</label>
          <input name="shoot_date_notes" className={inputClass} style={inputStyle} placeholder="e.g. TBD, pending client" />
        </div>
      </div>

      {/* Talent */}
      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <label className={labelClass} style={labelStyle}>Talent Count</label>
          <input name="talent_count" type="number" min="0" className={inputClass} style={inputStyle} />
        </div>
        <div>
          <label className={labelClass} style={labelStyle}>Talent Spec</label>
          <input name="talent_spec" className={inputClass} style={inputStyle} placeholder="e.g. 1 photographer, 1 HMU" />
        </div>
      </div>

      {/* Deliverables */}
      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <label className={labelClass} style={labelStyle}>Deliverables Type</label>
          <input name="deliverables_type" className={inputClass} style={inputStyle} placeholder="e.g. Stills + BTS video" />
        </div>
        <div>
          <label className={labelClass} style={labelStyle}>Deliverables Count</label>
          <input name="deliverables_count" type="number" min="0" className={inputClass} style={inputStyle} />
        </div>
      </div>

      {/* Usage */}
      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <label className={labelClass} style={labelStyle}>Usage Duration (months)</label>
          <input name="usage_duration_months" type="number" min="0" className={inputClass} style={inputStyle} placeholder="e.g. 12" />
        </div>
        <div>
          <label className={labelClass} style={labelStyle}>Budget Indication (AUD)</label>
          <input name="budget_indication" type="number" min="0" step="0.01" className={inputClass} style={inputStyle} />
        </div>
      </div>
      <div>
        <label className={labelClass} style={labelStyle}>Usage Notes</label>
        <input name="usage_notes" className={inputClass} style={inputStyle} placeholder="e.g. Digital owned, AU only" />
      </div>

      {/* Raw brief */}
      <div>
        <label className={labelClass} style={labelStyle}>Raw Brief / Email</label>
        <textarea name="brief_raw_text" rows={4} className={inputClass} style={inputStyle} placeholder="Paste the original brief or email here..." />
      </div>

      {/* Agency notes */}
      <div>
        <label className={labelClass} style={labelStyle}>Agency Notes (internal)</label>
        <textarea name="agency_notes" rows={2} className={inputClass} style={inputStyle} />
      </div>

      <button
        type="submit"
        disabled={submitting}
        className="rounded-md px-6 py-2.5 text-sm font-medium disabled:opacity-50"
        style={{ background: PALETTE.accent, color: PALETTE.bg }}
      >
        {submitting ? 'Creating...' : 'Create Booking'}
      </button>
    </form>
  );
}
