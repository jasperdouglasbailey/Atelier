'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { updateBookingAction } from '@/app/actions/bookings';
import {
  SHOOT_TIERS, SHOOT_TIER_LABELS, PALETTE,
} from '@/lib/utils/constants';
import { dateRangeToInputs } from '@/lib/utils/daterange';
import type { BookingDetailRow } from '@/lib/data/bookings';
import type { Client, Brand } from '@/lib/types/database';

type Props = {
  booking: BookingDetailRow;
  clients: Client[];
  brands: Brand[];
};

const POST_PROD_OPTIONS = [
  { value: '', label: '— Not set —' },
  { value: 'us_via_artist', label: 'Us via artist' },
  { value: 'us_via_post_team', label: 'Us via post team' },
  { value: 'client_in_house', label: 'Client in-house' },
  { value: 'client_outsourced', label: 'Client outsourced' },
];

const inputClass = 'w-full rounded-md border bg-transparent px-3 py-2 text-sm';
const inputStyle = { borderColor: PALETTE.border, color: PALETTE.text, background: PALETTE.bg };
const labelClass = 'block text-xs font-medium mb-1';
const labelStyle = { color: PALETTE.muted };


export default function BookingEditForm({ booking, clients, brands }: Props) {
  const router = useRouter();
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const dates = dateRangeToInputs(booking.shoot_dates);

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setSaving(true);
    setError(null);
    const formData = new FormData(e.currentTarget);
    const result = await updateBookingAction(booking.id, formData);
    setSaving(false);
    if ('error' in result) {
      setError(result.error ?? 'Unknown error');
    } else {
      router.push(`/bookings/${booking.id}`);
      router.refresh();
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      {error && (
        <div className="rounded-md border px-4 py-3 text-sm" style={{ borderColor: PALETTE.danger, color: PALETTE.danger, background: `${PALETTE.danger}11` }}>
          {error}
        </div>
      )}

      {/* Core */}
      <div>
        <label className={labelClass} style={labelStyle}>Project Name *</label>
        <input name="title" required defaultValue={booking.title} className={inputClass} style={inputStyle} />
      </div>

      <div>
        <label className={labelClass} style={labelStyle}>Shoot Tier *</label>
        <select name="tier" className={inputClass} style={inputStyle} defaultValue={booking.tier}>
          {SHOOT_TIERS.map((t) => (
            <option key={t} value={t}>{SHOOT_TIER_LABELS[t]}</option>
          ))}
        </select>
      </div>

      {/* Client & Brand */}
      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <label className={labelClass} style={labelStyle}>Client (Billing)</label>
          <select name="client_id" className={inputClass} style={inputStyle} defaultValue={booking.client_id ?? ''}>
            <option value="">— None —</option>
            {clients.map((c) => (
              <option key={c.id} value={c.id}>{c.name}{c.company ? ` (${c.company})` : ''}</option>
            ))}
          </select>
        </div>
        <div>
          <label className={labelClass} style={labelStyle}>End Brand</label>
          <select name="brand_id" className={inputClass} style={inputStyle} defaultValue={booking.brand_id ?? ''}>
            <option value="">— None —</option>
            {brands.map((b) => (
              <option key={b.id} value={b.id}>{b.name}</option>
            ))}
          </select>
        </div>
      </div>

      {/* Location & dates */}
      <div>
        <label className={labelClass} style={labelStyle}>Shoot Location</label>
        <input name="shoot_location" defaultValue={booking.shoot_location ?? ''} className={inputClass} style={inputStyle} />
      </div>

      <div className="grid gap-4 sm:grid-cols-3">
        <div>
          <label className={labelClass} style={labelStyle}>Shoot Start Date</label>
          <input name="shoot_date_start" type="date" defaultValue={dates.start} className={inputClass} style={inputStyle} />
        </div>
        <div>
          <label className={labelClass} style={labelStyle}>Shoot End Date</label>
          <input name="shoot_date_end" type="date" defaultValue={dates.end} className={inputClass} style={inputStyle} />
          <p className="mt-0.5 text-[10px]" style={{ color: PALETTE.muted }}>Leave blank for single-day</p>
        </div>
        <div>
          <label className={labelClass} style={labelStyle}>Date Notes (free text)</label>
          <input name="shoot_date_notes" defaultValue={booking.shoot_date_notes ?? ''} className={inputClass} style={inputStyle} placeholder="e.g. TBD, pending client" />
        </div>
      </div>

      {/* Talent */}
      <div>
        <label className={labelClass} style={labelStyle}>Talent Spec</label>
        <input name="talent_spec" defaultValue={booking.talent_spec ?? ''} className={inputClass} style={inputStyle} />
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <label className={labelClass} style={labelStyle}>Looks per Talent</label>
          <input name="looks_per_talent" type="number" min="0" defaultValue={booking.looks_per_talent ?? ''} className={inputClass} style={inputStyle} />
        </div>
      </div>

      {/* Deliverables */}
      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <label className={labelClass} style={labelStyle}>Deliverables Type</label>
          <input name="deliverables_type" defaultValue={booking.deliverables_type ?? ''} className={inputClass} style={inputStyle} placeholder="e.g. Stills + BTS video" />
        </div>
        <div>
          <label className={labelClass} style={labelStyle}>Deliverables Count</label>
          <input name="deliverables_count" type="number" min="0" defaultValue={booking.deliverables_count ?? ''} className={inputClass} style={inputStyle} />
        </div>
      </div>

      <div>
        <label className={labelClass} style={labelStyle}>Selects Cadence</label>
        <input name="selects_cadence" defaultValue={booking.selects_cadence ?? ''} className={inputClass} style={inputStyle} placeholder="e.g. 1 round of selects within 48h" />
      </div>

      {/* Post-production */}
      <div>
        <label className={labelClass} style={labelStyle}>Post-Production Ownership</label>
        <select name="post_production_ownership" className={inputClass} style={inputStyle} defaultValue={booking.post_production_ownership ?? ''}>
          {POST_PROD_OPTIONS.map((o) => (
            <option key={o.value} value={o.value}>{o.label}</option>
          ))}
        </select>
      </div>

      <div>
        <label className={labelClass} style={labelStyle}>Retouch Note Format</label>
        <input name="retouch_note_format" defaultValue={booking.retouch_note_format ?? ''} className={inputClass} style={inputStyle} placeholder="e.g. Lightroom .xmp, Capture One session" />
      </div>

      {/* Usage */}
      <div>
        <label className={labelClass} style={labelStyle}>Usage Duration (months)</label>
        <input name="usage_duration_months" type="number" min="0" defaultValue={booking.usage_duration_months ?? ''} className={inputClass} style={inputStyle} />
      </div>

      <div>
        <label className={labelClass} style={labelStyle}>Usage Notes</label>
        <input name="usage_notes" defaultValue={booking.usage_notes ?? ''} className={inputClass} style={inputStyle} placeholder="e.g. Digital owned, AU only" />
      </div>

      {/* Logistics */}
      <div>
        <label className={labelClass} style={labelStyle}>Video References</label>
        <input name="video_references" defaultValue={booking.video_references ?? ''} className={inputClass} style={inputStyle} placeholder="e.g. URLs to reference videos" />
      </div>

      <div>
        <label className={labelClass} style={labelStyle}>Wardrobe Responsibility</label>
        <input name="wardrobe_responsibility" defaultValue={booking.wardrobe_responsibility ?? ''} className={inputClass} style={inputStyle} placeholder="e.g. Client to supply, Stylist sourcing" />
      </div>

      {/* Notes */}
      <div>
        <label className={labelClass} style={labelStyle}>Agency Notes (internal)</label>
        <textarea name="agency_notes" rows={3} defaultValue={booking.agency_notes ?? ''} className={inputClass} style={inputStyle} />
      </div>

      <div>
        <label className={labelClass} style={labelStyle}>Raw Brief / Email</label>
        <textarea name="brief_raw_text" rows={6} defaultValue={booking.brief_raw_text ?? ''} className={inputClass} style={inputStyle} />
      </div>

      {/* Actions */}
      <div className="flex gap-3">
        <button
          type="submit"
          disabled={saving}
          className="rounded-md px-6 py-2.5 text-sm font-medium disabled:opacity-50"
          style={{ background: PALETTE.accent, color: PALETTE.bg }}
        >
          {saving ? 'Saving…' : 'Save Changes'}
        </button>
        <button
          type="button"
          onClick={() => router.back()}
          className="rounded-md px-6 py-2.5 text-sm font-medium"
          style={{ background: 'transparent', color: PALETTE.muted, border: `1px solid ${PALETTE.border}` }}
        >
          Cancel
        </button>
      </div>
    </form>
  );
}
