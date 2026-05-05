'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { createLocationAction, updateLocationAction } from '@/app/actions/locations';
import { PALETTE } from '@/lib/utils/constants';
import type { Location, StudioType } from '@/lib/types/database';

type Props = {
  location?: Location; // undefined = create mode
};

const inputClass = 'w-full rounded-md border bg-transparent px-3 py-2 text-sm';
const inputStyle = { borderColor: PALETTE.border, color: PALETTE.text, background: PALETTE.bg };
const labelClass = 'block text-xs font-medium mb-1';
const labelStyle = { color: PALETTE.muted };

const STUDIO_TYPE_OPTIONS: { value: StudioType; label: string }[] = [
  { value: 'photo_studio', label: 'Photo Studio' },
  { value: 'film_studio', label: 'Film Studio' },
  { value: 'outdoor', label: 'Outdoor' },
  { value: 'retail', label: 'Retail' },
  { value: 'residential', label: 'Residential' },
  { value: 'venue', label: 'Venue' },
  { value: 'other', label: 'Other' },
];

const FACILITY_OPTIONS = [
  { value: 'change_rooms', label: 'Change rooms' },
  { value: 'kitchen', label: 'Kitchen' },
  { value: 'wifi', label: 'Wi-Fi' },
  { value: 'air_con', label: 'Air conditioning' },
  { value: 'natural_light', label: 'Natural light' },
  { value: 'cyclorama', label: 'Cyclorama' },
  { value: 'loading_dock', label: 'Loading dock' },
  { value: 'lift_access', label: 'Lift access' },
  { value: 'power_3phase', label: '3-phase power' },
  { value: 'outdoor_space', label: 'Outdoor space' },
  { value: 'catering_available', label: 'Catering available' },
  { value: 'parking_onsite', label: 'On-site parking' },
];

const AU_STATES = ['NSW', 'VIC', 'QLD', 'WA', 'SA', 'TAS', 'ACT', 'NT'];

export default function LocationForm({ location }: Props) {
  const router = useRouter();
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [facilities, setFacilities] = useState<Set<string>>(
    new Set(location?.facilities ?? []),
  );
  const [studioType, setStudioType] = useState<StudioType>(location?.studio_type ?? 'photo_studio');

  function toggleFacility(v: string) {
    setFacilities((prev) => {
      const next = new Set(prev);
      next.has(v) ? next.delete(v) : next.add(v);
      return next;
    });
  }

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setSaving(true);
    setError(null);

    const fd = new FormData(e.currentTarget);
    fd.set('studio_type', studioType);
    fd.set('facilities', JSON.stringify([...facilities]));

    const result: { ok?: boolean; id?: string; error?: string } = location
      ? await updateLocationAction(location.id, fd)
      : await createLocationAction(fd);

    setSaving(false);

    if (result.error) {
      setError(result.error);
      return;
    }

    router.push(location ? `/locations/${location.id}` : `/locations/${result.id}`);
  }

  const v = location; // shorthand

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      {error && (
        <div className="rounded border px-4 py-3 text-sm" style={{ borderColor: PALETTE.danger, color: PALETTE.danger, background: `${PALETTE.danger}11` }}>
          {error}
        </div>
      )}

      {/* ── Identity ─────────────────────────────────────────── */}
      <section className="space-y-4">
        <h2 className="text-xs font-semibold uppercase tracking-wide" style={{ color: PALETTE.muted }}>Identity</h2>

        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label className={labelClass} style={labelStyle}>Name *</label>
            <input name="name" required defaultValue={v?.name} className={inputClass} style={inputStyle} placeholder="Studio 5" />
          </div>
          <div>
            <label className={labelClass} style={labelStyle}>Alias / shorthand</label>
            <input name="alias" defaultValue={v?.alias ?? ''} className={inputClass} style={inputStyle} placeholder="S5" />
          </div>
        </div>

        <div>
          <label className={labelClass} style={labelStyle}>Studio Type</label>
          <div className="mt-1 flex flex-wrap gap-2">
            {STUDIO_TYPE_OPTIONS.map(({ value, label }) => {
              const active = studioType === value;
              return (
                <button
                  key={value}
                  type="button"
                  onClick={() => setStudioType(value)}
                  className="rounded-full px-3 py-1 text-xs font-medium"
                  style={{
                    background: active ? PALETTE.accent : `${PALETTE.accent}18`,
                    color: active ? PALETTE.bg : PALETTE.accent,
                    border: `1px solid ${active ? PALETTE.accent : PALETTE.accent + '44'}`,
                  }}
                >
                  {label}
                </button>
              );
            })}
          </div>
        </div>
      </section>

      {/* ── Address ──────────────────────────────────────────── */}
      <section className="space-y-4">
        <h2 className="text-xs font-semibold uppercase tracking-wide" style={{ color: PALETTE.muted }}>Address</h2>

        <div>
          <label className={labelClass} style={labelStyle}>Street Address</label>
          <input name="address" defaultValue={v?.address ?? ''} className={inputClass} style={inputStyle} placeholder="1 Smith St" />
        </div>

        <div className="grid gap-4 sm:grid-cols-3">
          <div>
            <label className={labelClass} style={labelStyle}>Suburb</label>
            <input name="suburb" defaultValue={v?.suburb ?? ''} className={inputClass} style={inputStyle} placeholder="Alexandria" />
          </div>
          <div>
            <label className={labelClass} style={labelStyle}>State</label>
            <select name="state" defaultValue={v?.state ?? 'NSW'} className={inputClass} style={inputStyle}>
              {AU_STATES.map((s) => <option key={s} value={s}>{s}</option>)}
            </select>
          </div>
          <div>
            <label className={labelClass} style={labelStyle}>Postcode</label>
            <input name="postcode" defaultValue={v?.postcode ?? ''} className={inputClass} style={inputStyle} placeholder="2015" />
          </div>
        </div>
      </section>

      {/* ── Contact ──────────────────────────────────────────── */}
      <section className="space-y-4">
        <h2 className="text-xs font-semibold uppercase tracking-wide" style={{ color: PALETTE.muted }}>Contact</h2>

        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label className={labelClass} style={labelStyle}>Contact Name</label>
            <input name="contact_name" defaultValue={v?.contact_name ?? ''} className={inputClass} style={inputStyle} />
          </div>
          <div>
            <label className={labelClass} style={labelStyle}>Contact Email</label>
            <input name="contact_email" type="email" defaultValue={v?.contact_email ?? ''} className={inputClass} style={inputStyle} />
          </div>
          <div>
            <label className={labelClass} style={labelStyle}>Contact Phone</label>
            <input name="contact_phone" defaultValue={v?.contact_phone ?? ''} className={inputClass} style={inputStyle} />
          </div>
          <div>
            <label className={labelClass} style={labelStyle}>Website</label>
            <input name="website" type="url" defaultValue={v?.website ?? ''} className={inputClass} style={inputStyle} placeholder="https://..." />
          </div>
        </div>
      </section>

      {/* ── Rates ────────────────────────────────────────────── */}
      <section className="space-y-4">
        <h2 className="text-xs font-semibold uppercase tracking-wide" style={{ color: PALETTE.muted }}>Rates (AUD, ex-GST)</h2>

        <div className="grid gap-4 sm:grid-cols-3">
          <div>
            <label className={labelClass} style={labelStyle}>Half-day rate ($)</label>
            <input name="half_day_rate" type="number" step="50" min="0" defaultValue={v?.half_day_rate ?? ''} className={inputClass} style={inputStyle} />
          </div>
          <div>
            <label className={labelClass} style={labelStyle}>Full-day rate ($)</label>
            <input name="full_day_rate" type="number" step="50" min="0" defaultValue={v?.full_day_rate ?? ''} className={inputClass} style={inputStyle} />
          </div>
          <div>
            <label className={labelClass} style={labelStyle}>Weekend surcharge (%)</label>
            <input name="weekend_surcharge_pct" type="number" step="0.05" min="0" max="1" defaultValue={v?.weekend_surcharge_pct ?? ''} className={inputClass} style={inputStyle} placeholder="0.25" />
            <p className="mt-0.5 text-[10px]" style={{ color: PALETTE.muted }}>Enter as decimal, e.g. 0.25 = 25%</p>
          </div>
        </div>

        <div>
          <label className={labelClass} style={labelStyle}>Rate Notes</label>
          <input name="rate_notes" defaultValue={v?.rate_notes ?? ''} className={inputClass} style={inputStyle} placeholder="Power included; catering separate" />
        </div>
      </section>

      {/* ── Facilities ───────────────────────────────────────── */}
      <section className="space-y-4">
        <h2 className="text-xs font-semibold uppercase tracking-wide" style={{ color: PALETTE.muted }}>Facilities</h2>

        <div className="grid grid-cols-2 gap-1.5 sm:grid-cols-3">
          {FACILITY_OPTIONS.map(({ value, label }) => {
            const active = facilities.has(value);
            return (
              <label
                key={value}
                className="flex items-center gap-2 cursor-pointer rounded px-2.5 py-1.5 text-xs select-none"
                style={{
                  background: active ? `${PALETTE.accent}18` : 'transparent',
                  color: active ? PALETTE.accent : PALETTE.muted,
                  border: `1px solid ${active ? PALETTE.accent + '44' : PALETTE.border}`,
                }}
              >
                <input
                  type="checkbox"
                  checked={active}
                  onChange={() => toggleFacility(value)}
                  style={{ accentColor: PALETTE.accent }}
                />
                {label}
              </label>
            );
          })}
        </div>
      </section>

      {/* ── Space ────────────────────────────────────────────── */}
      <section className="space-y-4">
        <h2 className="text-xs font-semibold uppercase tracking-wide" style={{ color: PALETTE.muted }}>Space</h2>
        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label className={labelClass} style={labelStyle}>Area (m²)</label>
            <input name="square_metres" type="number" step="10" min="0" defaultValue={v?.square_metres ?? ''} className={inputClass} style={inputStyle} />
          </div>
          <div>
            <label className={labelClass} style={labelStyle}>Max capacity (persons)</label>
            <input name="max_capacity" type="number" min="0" defaultValue={v?.max_capacity ?? ''} className={inputClass} style={inputStyle} />
          </div>
        </div>
      </section>

      {/* ── Logistics ─────────────────────────────────────────── */}
      <section className="space-y-4">
        <h2 className="text-xs font-semibold uppercase tracking-wide" style={{ color: PALETTE.muted }}>Logistics</h2>
        <div>
          <label className={labelClass} style={labelStyle}>Parking Notes</label>
          <textarea name="parking_notes" rows={2} defaultValue={v?.parking_notes ?? ''} className={inputClass} style={inputStyle} placeholder="Street parking on Smith St; loading zone 7–10am" />
        </div>
        <div>
          <label className={labelClass} style={labelStyle}>Access / Arrival Notes</label>
          <textarea name="access_notes" rows={2} defaultValue={v?.access_notes ?? ''} className={inputClass} style={inputStyle} placeholder="Key code: 1234. Call reception on arrival." />
        </div>
      </section>

      {/* ── Notes ────────────────────────────────────────────── */}
      <section className="space-y-4">
        <h2 className="text-xs font-semibold uppercase tracking-wide" style={{ color: PALETTE.muted }}>Internal Notes</h2>
        <textarea name="notes" rows={3} defaultValue={v?.notes ?? ''} className={inputClass} style={inputStyle} placeholder="Anything else worth remembering about this location..." />
      </section>

      {/* ── Active toggle ────────────────────────────────────── */}
      {location && (
        <div>
          <label className="flex items-center gap-3 cursor-pointer">
            <input
              type="checkbox"
              name="is_active"
              value="true"
              defaultChecked={v?.is_active ?? true}
              style={{ accentColor: PALETTE.accent }}
            />
            <span className="text-sm" style={{ color: PALETTE.text }}>Active (shows on booking forms)</span>
          </label>
        </div>
      )}

      <div className="flex gap-3">
        <button
          type="submit"
          disabled={saving}
          className="rounded-md px-6 py-2.5 text-sm font-medium disabled:opacity-50"
          style={{ background: PALETTE.accent, color: PALETTE.bg }}
        >
          {saving ? 'Saving...' : location ? 'Save Changes' : 'Add Location'}
        </button>
        <button
          type="button"
          onClick={() => router.back()}
          className="rounded-md px-4 py-2.5 text-sm"
          style={{ color: PALETTE.muted, border: `1px solid ${PALETTE.border}` }}
        >
          Cancel
        </button>
      </div>
    </form>
  );
}
