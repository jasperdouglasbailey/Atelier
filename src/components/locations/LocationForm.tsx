'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { createLocationAction, updateLocationAction } from '@/app/actions/locations';
import { PALETTE } from '@/lib/utils/constants';
import type { Location, StudioType, StudioRoom } from '@/lib/types/database';

type Props = {
  location?: Location;
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

const ROOM_FEATURE_OPTIONS = [
  { value: 'cyc_wall', label: 'Cyc wall' },
  { value: 'led_lighting', label: 'LED lighting' },
  { value: 'blackout', label: 'Blackout blinds' },
  { value: 'natural_light', label: 'Natural light' },
  { value: 'camera_grid', label: 'Camera grid' },
  { value: 'power_3phase', label: '3-phase power' },
  { value: 'change_area', label: 'Change area' },
  { value: 'kitchen', label: 'Kitchen access' },
];

const AU_STATES = ['NSW', 'VIC', 'QLD', 'WA', 'SA', 'TAS', 'ACT', 'NT'];

function makeRoom(): StudioRoom {
  return {
    id: `room-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
    name: '',
    half_day_rate: null,
    full_day_rate: null,
    weekend_surcharge_pct: null,
    square_metres: null,
    max_capacity: null,
    features: [],
    notes: null,
  };
}

function RoomEditor({
  room,
  index,
  onChange,
  onRemove,
}: {
  room: StudioRoom;
  index: number;
  onChange: (r: StudioRoom) => void;
  onRemove: () => void;
}) {
  function toggleFeature(f: string) {
    onChange({
      ...room,
      features: room.features.includes(f)
        ? room.features.filter((x) => x !== f)
        : [...room.features, f],
    });
  }

  return (
    <div className="rounded-lg border p-4 space-y-3" style={{ borderColor: PALETTE.border, background: PALETTE.bg }}>
      <div className="flex items-center justify-between">
        <span className="text-xs font-semibold uppercase tracking-wide" style={{ color: PALETTE.accent }}>
          Room {index + 1}
        </span>
        <button type="button" onClick={onRemove} className="text-xs" style={{ color: PALETTE.danger }}>
          Remove
        </button>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <div className="sm:col-span-2">
          <label className={labelClass} style={labelStyle}>Room name *</label>
          <input
            value={room.name}
            onChange={(e) => onChange({ ...room, name: e.target.value })}
            className={inputClass}
            style={inputStyle}
            placeholder="Studio A, Cyc Studio, Stage 2…"
          />
        </div>
        <div>
          <label className={labelClass} style={labelStyle}>Half-day rate ($)</label>
          <input
            type="number" step="50" min="0"
            value={room.half_day_rate ?? ''}
            onChange={(e) => onChange({ ...room, half_day_rate: e.target.value ? Number(e.target.value) : null })}
            className={inputClass} style={inputStyle}
          />
        </div>
        <div>
          <label className={labelClass} style={labelStyle}>Full-day rate ($)</label>
          <input
            type="number" step="50" min="0"
            value={room.full_day_rate ?? ''}
            onChange={(e) => onChange({ ...room, full_day_rate: e.target.value ? Number(e.target.value) : null })}
            className={inputClass} style={inputStyle}
          />
        </div>
        <div>
          <label className={labelClass} style={labelStyle}>Weekend surcharge (%)</label>
          <input
            type="number" step="0.05" min="0" max="1"
            value={room.weekend_surcharge_pct ?? ''}
            onChange={(e) => onChange({ ...room, weekend_surcharge_pct: e.target.value ? Number(e.target.value) : null })}
            className={inputClass} style={inputStyle}
            placeholder="0.25"
          />
        </div>
        <div>
          <label className={labelClass} style={labelStyle}>Area (m²)</label>
          <input
            type="number" step="10" min="0"
            value={room.square_metres ?? ''}
            onChange={(e) => onChange({ ...room, square_metres: e.target.value ? Number(e.target.value) : null })}
            className={inputClass} style={inputStyle}
          />
        </div>
        <div>
          <label className={labelClass} style={labelStyle}>Max capacity (persons)</label>
          <input
            type="number" min="0"
            value={room.max_capacity ?? ''}
            onChange={(e) => onChange({ ...room, max_capacity: e.target.value ? Number(e.target.value) : null })}
            className={inputClass} style={inputStyle}
          />
        </div>
      </div>

      <div>
        <label className={labelClass} style={labelStyle}>Room features</label>
        <div className="mt-1 flex flex-wrap gap-1.5">
          {ROOM_FEATURE_OPTIONS.map(({ value, label }) => {
            const active = room.features.includes(value);
            return (
              <button
                key={value}
                type="button"
                onClick={() => toggleFeature(value)}
                className="rounded-full px-2.5 py-0.5 text-[11px] font-medium"
                style={{
                  background: active ? `${PALETTE.accent}22` : 'transparent',
                  color: active ? PALETTE.accent : PALETTE.muted,
                  border: `1px solid ${active ? PALETTE.accent + '66' : PALETTE.border}`,
                }}
              >
                {label}
              </button>
            );
          })}
        </div>
      </div>

      <div>
        <label className={labelClass} style={labelStyle}>Room notes</label>
        <textarea
          rows={2}
          value={room.notes ?? ''}
          onChange={(e) => onChange({ ...room, notes: e.target.value || null })}
          className={inputClass} style={inputStyle}
          placeholder="LED lighting rig included, cyc requires 3hr setup, etc."
        />
      </div>
    </div>
  );
}

export default function LocationForm({ location }: Props) {
  const router = useRouter();
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [facilities, setFacilities] = useState<Set<string>>(new Set(location?.facilities ?? []));
  const [studioType, setStudioType] = useState<StudioType>(location?.studio_type ?? 'photo_studio');
  const [rooms, setRooms] = useState<StudioRoom[]>(location?.studio_rooms ?? []);

  const isStudio = studioType === 'photo_studio' || studioType === 'film_studio';

  function toggleFacility(v: string) {
    setFacilities((prev) => {
      const next = new Set(prev);
      if (next.has(v)) next.delete(v); else next.add(v);
      return next;
    });
  }

  function addRoom() { setRooms((prev) => [...prev, makeRoom()]); }
  function removeRoom(i: number) { setRooms((prev) => prev.filter((_, idx) => idx !== i)); }
  function updateRoom(i: number, r: StudioRoom) { setRooms((prev) => prev.map((x, idx) => idx === i ? r : x)); }

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setSaving(true);
    setError(null);

    const fd = new FormData(e.currentTarget);
    fd.set('studio_type', studioType);
    fd.set('facilities', JSON.stringify([...facilities]));
    fd.set('studio_rooms', JSON.stringify(rooms));

    const result: { ok?: boolean; id?: string; error?: string } = location
      ? await updateLocationAction(location.id, fd)
      : await createLocationAction(fd);

    setSaving(false);

    if (result.error) { setError(result.error); return; }
    router.push(location ? `/locations/${location.id}` : `/locations/${result.id}`);
    router.refresh();
  }

  const v = location;

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      {error && (
        <div className="rounded border px-4 py-3 text-sm" style={{ borderColor: PALETTE.danger, color: PALETTE.danger, background: `${PALETTE.danger}11` }}>
          {error}
        </div>
      )}

      {/* Drive folder link (edit mode only, once populated) */}
      {v?.drive_folder_link && (
        <div className="flex items-center gap-2 rounded border px-4 py-3 text-sm" style={{ borderColor: PALETTE.border, background: `${PALETTE.accent}08` }}>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke={PALETTE.accent} strokeWidth="2" className="flex-shrink-0">
            <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/>
          </svg>
          <a
            href={v.drive_folder_link}
            target="_blank"
            rel="noopener noreferrer"
            className="text-xs font-medium underline"
            style={{ color: PALETTE.accent }}
          >
            Open Google Drive folder
          </a>
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

      {/* ── Rates (overall location) ──────────────────────────── */}
      <section className="space-y-4">
        <h2 className="text-xs font-semibold uppercase tracking-wide" style={{ color: PALETTE.muted }}>
          {isStudio ? 'Rates — Whole Venue (AUD, ex-GST)' : 'Rates (AUD, ex-GST)'}
        </h2>
        <p className="text-xs" style={{ color: PALETTE.muted }}>
          {isStudio
            ? 'Use these for venue-wide hire. Add individual rooms below for per-room pricing.'
            : 'Standard hire rates for this location.'}
        </p>
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
            <p className="mt-0.5 text-[10px]" style={{ color: PALETTE.muted }}>0.25 = 25%</p>
          </div>
        </div>
        <div>
          <label className={labelClass} style={labelStyle}>Rate Notes</label>
          <input name="rate_notes" defaultValue={v?.rate_notes ?? ''} className={inputClass} style={inputStyle} placeholder="Power included; catering separate" />
        </div>
      </section>

      {/* ── Studio Rooms (photo/film studios only) ────────────── */}
      {isStudio && (
        <section className="space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-xs font-semibold uppercase tracking-wide" style={{ color: PALETTE.muted }}>
              Studio Rooms &amp; Stages
            </h2>
            <button
              type="button"
              onClick={addRoom}
              className="rounded px-3 py-1 text-xs font-medium"
              style={{ background: `${PALETTE.accent}18`, color: PALETTE.accent, border: `1px solid ${PALETTE.accent}44` }}
            >
              + Add room
            </button>
          </div>

          {rooms.length === 0 ? (
            <p className="text-xs" style={{ color: PALETTE.muted }}>
              No rooms yet. Add individual rooms to enable per-room rate selection on bookings.
            </p>
          ) : (
            <div className="space-y-3">
              {rooms.map((room, i) => (
                <RoomEditor
                  key={room.id}
                  room={room}
                  index={i}
                  onChange={(r) => updateRoom(i, r)}
                  onRemove={() => removeRoom(i)}
                />
              ))}
            </div>
          )}
        </section>
      )}

      {/* ── Facilities ───────────────────────────────────────── */}
      <section className="space-y-4">
        <h2 className="text-xs font-semibold uppercase tracking-wide" style={{ color: PALETTE.muted }}>Facilities</h2>
        <div className="grid grid-cols-2 gap-1.5 sm:grid-cols-3">
          {FACILITY_OPTIONS.map(({ value, label }) => {
            const active = facilities.has(value);
            return (
              <label key={value} className="flex items-center gap-2 cursor-pointer rounded px-2.5 py-1.5 text-xs select-none" style={{ background: active ? `${PALETTE.accent}18` : 'transparent', color: active ? PALETTE.accent : PALETTE.muted, border: `1px solid ${active ? PALETTE.accent + '44' : PALETTE.border}` }}>
                <input type="checkbox" checked={active} onChange={() => toggleFacility(value)} style={{ accentColor: PALETTE.accent }} />
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
            <label className={labelClass} style={labelStyle}>Total area (m²)</label>
            <input name="square_metres" type="number" step="10" min="0" defaultValue={v?.square_metres ?? ''} className={inputClass} style={inputStyle} />
          </div>
          <div>
            <label className={labelClass} style={labelStyle}>Max capacity (persons)</label>
            <input name="max_capacity" type="number" min="0" defaultValue={v?.max_capacity ?? ''} className={inputClass} style={inputStyle} />
          </div>
        </div>
      </section>

      {/* ── Logistics ────────────────────────────────────────── */}
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

      {/* ── Internal Notes ───────────────────────────────────── */}
      <section className="space-y-4">
        <h2 className="text-xs font-semibold uppercase tracking-wide" style={{ color: PALETTE.muted }}>Internal Notes</h2>
        <textarea name="notes" rows={3} defaultValue={v?.notes ?? ''} className={inputClass} style={inputStyle} placeholder="Anything else worth remembering..." />
      </section>

      {/* ── Active toggle ────────────────────────────────────── */}
      {location && (
        <div>
          <label className="flex items-center gap-3 cursor-pointer">
            <input type="checkbox" name="is_active" value="true" defaultChecked={v?.is_active ?? true} style={{ accentColor: PALETTE.accent }} />
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
