'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { updateBookingAction } from '@/app/actions/bookings';
import { SHOOT_TIERS, SHOOT_TIER_LABELS, PALETTE } from '@/lib/utils/constants';
import { dateRangeToInputs } from '@/lib/utils/daterange';
import type { BookingDetailRow } from '@/lib/data/bookings';
import type { Client, Brand, UsageMedia, UsageTerritory } from '@/lib/types/database';

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

const USAGE_MEDIA_OPTIONS: { value: UsageMedia; label: string }[] = [
  { value: 'all_media',            label: 'All Media' },
  { value: 'all_print',            label: 'All Print' },
  { value: 'all_digital',          label: 'All Digital' },
  { value: 'ooh',                  label: 'OOH / Billboards' },
  { value: 'press',                label: 'Press / Magazines' },
  { value: 'brochures',            label: 'Brochures' },
  { value: 'packaging',            label: 'Packaging' },
  { value: 'pos',                  label: 'POS / In-store' },
  { value: 'posters',              label: 'Posters' },
  { value: 'collateral',           label: 'Collateral' },
  { value: 'direct_mail',          label: 'Direct Mail' },
  { value: 'pr_print',             label: 'PR (Print)' },
  { value: 'social_media',         label: 'Social Media' },
  { value: 'company_website',      label: 'Company Website' },
  { value: 'regional_website',     label: 'Regional Website' },
  { value: 'internet_advertising', label: 'Internet Advertising' },
  { value: 'digital_posters',      label: 'Digital Posters' },
  { value: 'digital_direct_mail',  label: 'Digital Direct Mail' },
  { value: 'mobile',               label: 'Mobile' },
  { value: 'intranet',             label: 'Intranet' },
  { value: 'pr_digital',           label: 'PR (Digital)' },
  { value: 'tv',                   label: 'TV / Broadcast' },
  { value: 'ambient',              label: 'Ambient' },
  { value: 'marketing_aids',       label: 'Marketing Aids' },
];

const USAGE_TERRITORY_OPTIONS: { value: UsageTerritory; label: string }[] = [
  { value: 'worldwide',        label: 'Worldwide' },
  { value: 'australia',        label: 'Australia' },
  { value: 'oceania',          label: 'Oceania' },
  { value: 'usa',              label: 'USA' },
  { value: 'north_america',    label: 'North America' },
  { value: 'europe_all',       label: 'Europe (all)' },
  { value: 'europe_eu',        label: 'Europe (EU)' },
  { value: 'europe_non_eu',    label: 'Europe (non-EU)' },
  { value: 'uk',               label: 'UK' },
  { value: 'asia_incl_japan',  label: 'Asia (incl. Japan)' },
  { value: 'asia_excl_japan',  label: 'Asia (excl. Japan)' },
  { value: 'middle_east',      label: 'Middle East' },
  { value: 'emea',             label: 'EMEA' },
  { value: 'uae',              label: 'UAE' },
  { value: 'gcc',              label: 'GCC' },
  { value: 'africa',           label: 'Africa' },
  { value: 'south_america',    label: 'South America' },
  { value: 'latin_america',    label: 'Latin America' },
];

const inputClass = 'w-full rounded-md border bg-transparent px-3 py-2 text-sm';
const inputStyle = { borderColor: PALETTE.border, color: PALETTE.text, background: PALETTE.bg };
const labelClass = 'block text-xs font-medium mb-1';
const labelStyle = { color: PALETTE.muted };

function SectionHeading({ children }: { children: React.ReactNode }) {
  return (
    <div className="pt-3 pb-0.5 border-t text-[10px] font-bold uppercase tracking-widest" style={{ borderColor: PALETTE.border, color: PALETTE.muted }}>
      {children}
    </div>
  );
}

function CheckGrid<T extends string>({
  options,
  selected,
  onToggle,
}: {
  options: { value: T; label: string }[];
  selected: Set<T>;
  onToggle: (v: T) => void;
}) {
  return (
    <div className="mt-1 grid grid-cols-2 gap-1 sm:grid-cols-3">
      {options.map(({ value, label }) => {
        const active = selected.has(value);
        return (
          <label
            key={value}
            className="flex items-center gap-2 cursor-pointer rounded px-2 py-1.5 text-xs select-none"
            style={{
              background: active ? `${PALETTE.accent}18` : 'transparent',
              color: active ? PALETTE.accent : PALETTE.muted,
              border: `1px solid ${active ? PALETTE.accent + '44' : PALETTE.border}`,
            }}
          >
            <input
              type="checkbox"
              className="accent-blue-400 flex-shrink-0"
              checked={active}
              onChange={() => onToggle(value)}
            />
            {label}
          </label>
        );
      })}
    </div>
  );
}

export default function BookingEditForm({ booking, clients, brands }: Props) {
  const router = useRouter();
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const dates = dateRangeToInputs(booking.shoot_dates);

  const [selectedMedia, setSelectedMedia] = useState<Set<UsageMedia>>(
    new Set(booking.usage_media ?? []),
  );
  const [selectedTerritories, setSelectedTerritories] = useState<Set<UsageTerritory>>(
    new Set(booking.usage_territory ?? []),
  );

  function toggleMedia(v: UsageMedia) {
    setSelectedMedia((prev) => { const n = new Set(prev); n.has(v) ? n.delete(v) : n.add(v); return n; });
  }
  function toggleTerritory(v: UsageTerritory) {
    setSelectedTerritories((prev) => { const n = new Set(prev); n.has(v) ? n.delete(v) : n.add(v); return n; });
  }

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setSaving(true);
    setError(null);
    const formData = new FormData(e.currentTarget);
    // Inject array fields as JSON — updateBookingAction deserialises them
    formData.set('usage_media', JSON.stringify([...selectedMedia]));
    formData.set('usage_territory', JSON.stringify([...selectedTerritories]));
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
    <form onSubmit={handleSubmit} className="space-y-5">
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
      <SectionHeading>Client &amp; Brand</SectionHeading>

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

      {/* Location & Dates */}
      <SectionHeading>Location &amp; Dates</SectionHeading>

      <div>
        <label className={labelClass} style={labelStyle}>Shoot Location</label>
        <input name="shoot_location" defaultValue={booking.shoot_location ?? ''} className={inputClass} style={inputStyle} />
      </div>

      <div className="grid gap-4 sm:grid-cols-3">
        <div>
          <label className={labelClass} style={labelStyle}>Start Date</label>
          <input name="shoot_date_start" type="date" defaultValue={dates.start} className={inputClass} style={inputStyle} />
        </div>
        <div>
          <label className={labelClass} style={labelStyle}>End Date</label>
          <input name="shoot_date_end" type="date" defaultValue={dates.end} className={inputClass} style={inputStyle} />
          <p className="mt-0.5 text-[10px]" style={{ color: PALETTE.muted }}>Leave blank for single-day</p>
        </div>
        <div>
          <label className={labelClass} style={labelStyle}>Date Notes</label>
          <input name="shoot_date_notes" defaultValue={booking.shoot_date_notes ?? ''} className={inputClass} style={inputStyle} placeholder="e.g. TBD, pending client" />
        </div>
      </div>

      {/* Deliverables */}
      <SectionHeading>Deliverables &amp; Post-Production</SectionHeading>

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
        <input name="selects_cadence" defaultValue={booking.selects_cadence ?? ''} className={inputClass} style={inputStyle} placeholder="e.g. 1 round within 48h" />
      </div>

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
      <SectionHeading>Usage</SectionHeading>

      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <label className={labelClass} style={labelStyle}>Duration (months)</label>
          <input name="usage_duration_months" type="number" min="0" defaultValue={booking.usage_duration_months ?? ''} className={inputClass} style={inputStyle} />
        </div>
        <div>
          <label className={labelClass} style={labelStyle}>Usage Notes</label>
          <input name="usage_notes" defaultValue={booking.usage_notes ?? ''} className={inputClass} style={inputStyle} placeholder="e.g. Digital owned, AU only" />
        </div>
      </div>

      <div>
        <label className={labelClass} style={labelStyle}>Media</label>
        <CheckGrid options={USAGE_MEDIA_OPTIONS} selected={selectedMedia} onToggle={toggleMedia} />
      </div>

      <div>
        <label className={labelClass} style={labelStyle}>Territory</label>
        <CheckGrid options={USAGE_TERRITORY_OPTIONS} selected={selectedTerritories} onToggle={toggleTerritory} />
      </div>

      {/* Talent */}
      <SectionHeading>Talent</SectionHeading>

      <div>
        <label className={labelClass} style={labelStyle}>Talent Spec</label>
        <input name="talent_spec" defaultValue={booking.talent_spec ?? ''} className={inputClass} style={inputStyle} placeholder="e.g. Oliver Begg (photographer), Jaque Di Condio (HMU)" />
      </div>

      {/* Production */}
      <SectionHeading>Production</SectionHeading>

      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <label className={labelClass} style={labelStyle}>Wardrobe Responsibility</label>
          <input name="wardrobe_responsibility" defaultValue={booking.wardrobe_responsibility ?? ''} className={inputClass} style={inputStyle} placeholder="e.g. Client to supply" />
        </div>
        <div>
          <label className={labelClass} style={labelStyle}>Video References</label>
          <input name="video_references" defaultValue={booking.video_references ?? ''} className={inputClass} style={inputStyle} placeholder="e.g. reference URLs" />
        </div>
      </div>

      {/* Internal */}
      <SectionHeading>Internal Notes</SectionHeading>

      <div>
        <label className={labelClass} style={labelStyle}>Agency Notes</label>
        <textarea name="agency_notes" rows={3} defaultValue={booking.agency_notes ?? ''} className={inputClass} style={inputStyle} />
      </div>

      <div>
        <label className={labelClass} style={labelStyle}>
          Raw Brief / Email
          <span className="ml-2 font-normal normal-case" style={{ color: '#666' }}>
            — source text for the Brief Parser (extracts dates, deliverables, usage automatically)
          </span>
        </label>
        <textarea name="brief_raw_text" rows={6} defaultValue={booking.brief_raw_text ?? ''} className={inputClass} style={inputStyle} />
      </div>

      <div className="flex gap-3 pt-2">
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
