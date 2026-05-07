'use client';

/**
 * BookingFormFields — single source of truth for the new + edit booking forms.
 *
 * Both /bookings/new and /bookings/[id]/edit render this component and supply
 * a different `onSubmit` handler. Field layout, validation, artist/location
 * pickers, and usage checkboxes are defined here once.
 *
 * For edit mode, pass `initial` (the Booking row) and `initialPrimaryTalentId`
 * (the current primary booking_talent talent_id, if any). The submit handler
 * for edit will receive `primary_talent_id` in the FormData if changed.
 */

import { useState, useEffect } from 'react';
import { createClientAction, createBrandAction } from '@/app/actions/entities';
import { getClientDefaultsAction } from '@/app/actions/bookings';
import { dateRangeToInputs } from '@/lib/utils/daterange';
import { SHOOT_TIERS, SHOOT_TIER_LABELS, PALETTE } from '@/lib/utils/constants';
import type {
  Booking, Client, Brand, Talent, Location,
  UsageMedia, UsageTerritory, ArtistDiscipline,
} from '@/lib/types/database';

type Props = {
  mode: 'create' | 'edit';
  /** Booking row when editing. Ignored in create mode. */
  initial?: Partial<Booking>;
  /** Current primary artist's talent_id when editing. */
  initialPrimaryTalentId?: string | null;
  clients: Client[];
  brands: Brand[];
  talent: Talent[];
  locations: Location[];
  /** Submit handler — wires to createBookingAction or updateBookingAction. */
  onSubmit: (formData: FormData) => Promise<{ ok: true; id?: string } | { error: string }>;
  /** Where to redirect on success. Receives the booking id from server action result. */
  onSuccessRedirect: (id: string | undefined) => void;
};

const inputClass = 'w-full rounded-md border bg-transparent px-3 py-2 text-sm';
const inputStyle = { borderColor: PALETTE.border, color: PALETTE.text, background: PALETTE.bg };
const labelClass = 'block text-xs font-medium mb-1';
const labelStyle = { color: PALETTE.muted };

const QUICK_CREATE_VALUE = '__new__';

const DISCIPLINE_LABELS: Record<ArtistDiscipline, string> = {
  photographer: 'Photographer',
  videographer: 'Videographer',
  wardrobe_stylist: 'Wardrobe Stylist',
  hair: 'Hair',
  makeup: 'Makeup',
  hair_and_makeup: 'Hair & Makeup',
  manicurist: 'Manicurist',
};

const DISCIPLINE_GROUPS: Array<{ label: string; disciplines: ArtistDiscipline[] }> = [
  { label: 'Photographers', disciplines: ['photographer'] },
  { label: 'Videographers', disciplines: ['videographer'] },
  { label: 'Stylists & Hair/Makeup', disciplines: ['wardrobe_stylist', 'hair', 'makeup', 'hair_and_makeup', 'manicurist'] },
];

const POST_PROD_OPTIONS = [
  { value: '', label: '— Not set —' },
  { value: 'us_via_artist', label: 'Us via artist' },
  { value: 'us_via_post_team', label: 'Us via post team' },
  { value: 'client_in_house', label: 'Client in-house' },
  { value: 'client_outsourced', label: 'Client outsourced' },
];

const USAGE_MEDIA_OPTIONS: { value: UsageMedia; label: string }[] = [
  { value: 'all_media', label: 'All Media' }, { value: 'all_print', label: 'All Print' }, { value: 'all_digital', label: 'All Digital' },
  { value: 'ooh', label: 'OOH / Billboards' }, { value: 'press', label: 'Press / Magazines' }, { value: 'brochures', label: 'Brochures' },
  { value: 'packaging', label: 'Packaging' }, { value: 'pos', label: 'POS / In-store' }, { value: 'posters', label: 'Posters' },
  { value: 'collateral', label: 'Collateral' }, { value: 'direct_mail', label: 'Direct Mail' }, { value: 'pr_print', label: 'PR (Print)' },
  { value: 'social_media', label: 'Social Media' }, { value: 'company_website', label: 'Company Website' }, { value: 'regional_website', label: 'Regional Website' },
  { value: 'internet_advertising', label: 'Internet Advertising' }, { value: 'digital_posters', label: 'Digital Posters' }, { value: 'digital_direct_mail', label: 'Digital Direct Mail' },
  { value: 'mobile', label: 'Mobile' }, { value: 'intranet', label: 'Intranet' }, { value: 'pr_digital', label: 'PR (Digital)' },
  { value: 'tv', label: 'TV / Broadcast' }, { value: 'ambient', label: 'Ambient' }, { value: 'marketing_aids', label: 'Marketing Aids' },
];

const USAGE_TERRITORY_OPTIONS: { value: UsageTerritory; label: string }[] = [
  { value: 'worldwide', label: 'Worldwide' }, { value: 'australia', label: 'Australia' }, { value: 'oceania', label: 'Oceania' },
  { value: 'usa', label: 'USA' }, { value: 'north_america', label: 'North America' },
  { value: 'europe_all', label: 'Europe (all)' }, { value: 'europe_eu', label: 'Europe (EU)' }, { value: 'europe_non_eu', label: 'Europe (non-EU)' },
  { value: 'uk', label: 'UK' },
  { value: 'asia_incl_japan', label: 'Asia (incl. Japan)' }, { value: 'asia_excl_japan', label: 'Asia (excl. Japan)' },
  { value: 'middle_east', label: 'Middle East' }, { value: 'emea', label: 'EMEA' },
  { value: 'uae', label: 'UAE' }, { value: 'gcc', label: 'GCC' },
  { value: 'africa', label: 'Africa' }, { value: 'south_america', label: 'South America' }, { value: 'latin_america', label: 'Latin America' },
];

function suggestTier(discipline: ArtistDiscipline | null): string {
  if (discipline === 'videographer') return 'fashion_film';
  return 'content';
}

/** Compact inline form that appears when "+ New …" is chosen from a dropdown. */
function QuickCreateForm({
  type,
  onCreated,
  onCancel,
}: {
  type: 'client' | 'brand';
  onCreated: (id: string, name: string, company: string) => void;
  onCancel: () => void;
}) {
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

export default function BookingFormFields({
  mode,
  initial,
  initialPrimaryTalentId = null,
  clients: initialClients,
  brands: initialBrands,
  talent,
  locations,
  onSubmit,
  onSuccessRedirect,
}: Props) {
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  // Primary artist
  const [selectedTalentId, setSelectedTalentId] = useState<string>(initialPrimaryTalentId ?? '');
  const selectedArtist = talent.find((t) => t.id === selectedTalentId) ?? null;

  // Client / brand state with inline quick-create
  const [clients, setClients] = useState(initialClients);
  const [selectedClientId, setSelectedClientId] = useState<string>(initial?.client_id ?? '');
  const [showNewClient, setShowNewClient] = useState(false);

  const [brands, setBrands] = useState(initialBrands);
  const [selectedBrandId, setSelectedBrandId] = useState<string>(initial?.brand_id ?? '');
  const [showNewBrand, setShowNewBrand] = useState(false);

  // Tier
  const [tier, setTier] = useState<string>(initial?.tier ?? 'content');

  // Location library pick
  const [locationPickId, setLocationPickId] = useState('');
  const [shootLocationText, setShootLocationText] = useState<string>(initial?.shoot_location ?? '');

  // Usage arrays
  const [selectedMedia, setSelectedMedia] = useState<Set<UsageMedia>>(new Set(initial?.usage_media ?? []));
  const [selectedTerritories, setSelectedTerritories] = useState<Set<UsageTerritory>>(new Set(initial?.usage_territory ?? []));

  // Controlled duration so autofill can update it
  const [durationMonths, setDurationMonths] = useState<string>(
    initial?.usage_duration_months != null ? String(initial.usage_duration_months) : '',
  );

  // Autofill badge: true when media/territory/duration were just pre-filled from recent bookings
  const [autofilled, setAutofilled] = useState(false);

  // Autofill usage fields from client's recent bookings whenever client changes (create mode only)
  useEffect(() => {
    if (mode !== 'create' || !selectedClientId) return;
    let cancelled = false;
    getClientDefaultsAction(selectedClientId)
      .then((defaults) => {
        if (cancelled) return;
        if (defaults.media.length > 0) setSelectedMedia(new Set(defaults.media as UsageMedia[]));
        if (defaults.territories.length > 0) setSelectedTerritories(new Set(defaults.territories as UsageTerritory[]));
        if (defaults.durationMonths != null) setDurationMonths(String(defaults.durationMonths));
        const hasDefaults = defaults.media.length > 0 || defaults.territories.length > 0 || defaults.durationMonths != null;
        setAutofilled(hasDefaults);
      })
      .catch(() => { /* autofill is best-effort — ignore errors */ });
    return () => { cancelled = true; };
  }, [selectedClientId, mode]);

  function toggleMedia(v: UsageMedia) {
    setAutofilled(false);
    setSelectedMedia((p) => { const n = new Set(p); if (n.has(v)) n.delete(v); else n.add(v); return n; });
  }
  function toggleTerritory(v: UsageTerritory) {
    setAutofilled(false);
    setSelectedTerritories((p) => { const n = new Set(p); if (n.has(v)) n.delete(v); else n.add(v); return n; });
  }

  function handleLocationPick(e: React.ChangeEvent<HTMLSelectElement>) {
    const id = e.target.value;
    setLocationPickId(id);
    if (id) {
      const loc = locations.find((l) => l.id === id);
      if (loc) {
        const parts = [loc.name, loc.suburb].filter(Boolean).join(', ');
        setShootLocationText(parts);
      }
    }
  }

  function handleTalentChange(e: React.ChangeEvent<HTMLSelectElement>) {
    const id = e.target.value;
    setSelectedTalentId(id);
    if (id && mode === 'create') {
      const artist = talent.find((t) => t.id === id);
      if (artist) {
        setTier((prev) => (prev === 'content' || prev === 'fashion_film') ? suggestTier(artist.discipline) : prev);
      }
    }
  }

  function handleClientChange(e: React.ChangeEvent<HTMLSelectElement>) {
    setAutofilled(false);
    if (e.target.value === QUICK_CREATE_VALUE) {
      setShowNewClient(true);
      setSelectedClientId('');
    } else {
      setShowNewClient(false);
      setSelectedClientId(e.target.value);
      // Reset usage fields when client changes — useEffect will re-populate from recent bookings
      if (mode === 'create') {
        setSelectedMedia(new Set());
        setSelectedTerritories(new Set());
        setDurationMonths('');
      }
    }
  }

  function handleBrandChange(e: React.ChangeEvent<HTMLSelectElement>) {
    if (e.target.value === QUICK_CREATE_VALUE) { setShowNewBrand(true); setSelectedBrandId(''); }
    else { setShowNewBrand(false); setSelectedBrandId(e.target.value); }
  }

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    const formData = new FormData(e.currentTarget);

    if (selectedTalentId) formData.set('primary_talent_id', selectedTalentId);
    if (selectedArtist) formData.set('primary_talent_discipline', selectedArtist.discipline);
    // Track whether the primary artist changed during edit so the action can update the join.
    if (mode === 'edit') {
      const changed = (initialPrimaryTalentId ?? '') !== selectedTalentId;
      formData.set('primary_talent_changed', changed ? '1' : '0');
    }
    if (selectedClientId) formData.set('client_id', selectedClientId);
    if (selectedBrandId) formData.set('brand_id', selectedBrandId);
    formData.set('tier', tier);
    formData.set('usage_media', JSON.stringify([...selectedMedia]));
    formData.set('usage_territory', JSON.stringify([...selectedTerritories]));

    const result = await onSubmit(formData);
    setSubmitting(false);

    if ('error' in result) {
      setError(result.error ?? 'Unknown error');
    } else {
      onSuccessRedirect(result.id);
    }
  }

  // Build optgroup structure for artist selector
  const artistGroups = DISCIPLINE_GROUPS.map(({ label, disciplines }) => ({
    label,
    artists: talent.filter((t) => t.is_active && disciplines.includes(t.discipline)),
  })).filter((g) => g.artists.length > 0);

  const inactiveArtists = talent.filter((t) => !t.is_active);
  const initialDates = dateRangeToInputs(initial?.shoot_dates ?? null);

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      {error && (
        <div className="rounded-md border px-4 py-3 text-sm" style={{ borderColor: PALETTE.danger, color: PALETTE.danger, background: `${PALETTE.danger}11` }}>
          {error}
        </div>
      )}

      {/* ── Primary Artist ─────────────────────────────────────── */}
      <div>
        <label className={labelClass} style={{ ...labelStyle, fontSize: 11, fontWeight: 700, letterSpacing: '0.05em', textTransform: 'uppercase' }}>
          Primary Artist {mode === 'create' ? '*' : ''}
        </label>
        <p className="text-[11px] mb-1.5" style={{ color: PALETTE.muted }}>
          The photographer or videographer this shoot is built around.
        </p>
        <select
          value={selectedTalentId}
          onChange={handleTalentChange}
          className={inputClass}
          style={{ ...inputStyle, fontWeight: selectedTalentId ? 500 : undefined }}
          required={mode === 'create'}
        >
          <option value="">— Select artist —</option>
          {artistGroups.map(({ label, artists }) => (
            <optgroup key={label} label={label}>
              {artists.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.working_name}{t.specialty ? ` · ${t.specialty}` : ''}
                </option>
              ))}
            </optgroup>
          ))}
          {inactiveArtists.length > 0 && (
            <optgroup label="Inactive">
              {inactiveArtists.map((t) => (
                <option key={t.id} value={t.id}>{t.working_name} (inactive)</option>
              ))}
            </optgroup>
          )}
        </select>

        {selectedArtist && (
          <div className="mt-2 flex items-center gap-2">
            <span
              className="rounded-full px-2.5 py-0.5 text-[11px] font-medium"
              style={{ background: `${PALETTE.accent}20`, color: PALETTE.accent, border: `1px solid ${PALETTE.accent}40` }}
            >
              {DISCIPLINE_LABELS[selectedArtist.discipline]}
            </span>
            {selectedArtist.default_day_rate && (
              <span className="text-[11px]" style={{ color: PALETTE.muted }}>
                Day rate: ${selectedArtist.default_day_rate.toLocaleString()}
              </span>
            )}
          </div>
        )}

        {mode === 'edit' && initialPrimaryTalentId && selectedTalentId !== initialPrimaryTalentId && (
          <p className="mt-2 text-[11px]" style={{ color: PALETTE.warning }}>
            Changing the primary artist will replace the existing booking-team artist record.
          </p>
        )}
      </div>

      <hr style={{ borderColor: PALETTE.border }} />

      {/* ── Project Name ───────────────────────────────────────── */}
      <div>
        <label className={labelClass} style={labelStyle}>Project Name *</label>
        <input name="title" required defaultValue={initial?.title ?? ''} className={inputClass} style={inputStyle} placeholder="e.g. AJE Spring/Summer Campaign" />
      </div>

      {/* ── Shoot Tier ─────────────────────────────────────────── */}
      <div>
        <label className={labelClass} style={labelStyle}>
          Shoot Tier *
          {mode === 'create' && selectedArtist && (
            <span className="ml-2 font-normal normal-case" style={{ color: PALETTE.muted }}>
              — suggested from artist discipline
            </span>
          )}
        </label>
        <select value={tier} onChange={(e) => setTier(e.target.value)} className={inputClass} style={inputStyle}>
          {SHOOT_TIERS.map((t) => (
            <option key={t} value={t}>{SHOOT_TIER_LABELS[t]}</option>
          ))}
        </select>
      </div>

      {/* ── Client & Brand ─────────────────────────────────────── */}
      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <label className={labelClass} style={labelStyle}>Client (Billing)</label>
          <select
            value={showNewClient ? QUICK_CREATE_VALUE : selectedClientId}
            onChange={handleClientChange}
            className={inputClass}
            style={inputStyle}
          >
            <option value="">— Select —</option>
            {clients.map((c) => (
              <option key={c.id} value={c.id}>{c.name}{c.company ? ` (${c.company})` : ''}</option>
            ))}
            <option value={QUICK_CREATE_VALUE}>+ New client…</option>
          </select>
          {showNewClient && (
            <QuickCreateForm
              type="client"
              onCreated={(id, name, company) => {
                const now = new Date().toISOString();
                const newClient: Client = {
                  id, name, company: company || null,
                  created_at: now, updated_at: now,
                  email: null, phone: null, abn: null,
                  is_creative_agency: false, parent_company_id: null,
                  payment_terms_days: null, notes: null,
                  avg_doi_days: null, preferred_comms: null,
                  communication_style: null,
                  drive_folder_id: null, drive_folder_link: null,
                };
                setClients((prev) => [...prev, newClient]);
                setSelectedClientId(id);
                setShowNewClient(false);
              }}
              onCancel={() => { setShowNewClient(false); setSelectedClientId(''); }}
            />
          )}
        </div>
        <div>
          <label className={labelClass} style={labelStyle}>End Brand</label>
          <select
            value={showNewBrand ? QUICK_CREATE_VALUE : selectedBrandId}
            onChange={handleBrandChange}
            className={inputClass}
            style={inputStyle}
          >
            <option value="">— Select —</option>
            {brands.map((b) => (
              <option key={b.id} value={b.id}>{b.name}</option>
            ))}
            <option value={QUICK_CREATE_VALUE}>+ New brand…</option>
          </select>
          {showNewBrand && (
            <QuickCreateForm
              type="brand"
              onCreated={(id, name) => {
                const newBrand: Brand = { id, name, created_at: new Date().toISOString(), industry: null, notes: null };
                setBrands((prev) => [...prev, newBrand]);
                setSelectedBrandId(id);
                setShowNewBrand(false);
              }}
              onCancel={() => { setShowNewBrand(false); setSelectedBrandId(''); }}
            />
          )}
        </div>
      </div>

      {mode === 'create' && (
        <div>
          <label className={labelClass} style={labelStyle}>Creative Agency (if different from billing client)</label>
          <select name="creative_agency_id" className={inputClass} style={inputStyle}>
            <option value="">— None —</option>
            {clients.filter((c) => c.is_creative_agency).map((c) => (
              <option key={c.id} value={c.id}>{c.name}</option>
            ))}
          </select>
        </div>
      )}

      {/* ── Location & Dates ───────────────────────────────────── */}
      <div>
        <label className={labelClass} style={labelStyle}>Shoot Location</label>
        {locations.length > 0 && (
          <div className="mb-2">
            <select
              value={locationPickId}
              onChange={handleLocationPick}
              className={inputClass}
              style={{ ...inputStyle, fontSize: 12, color: locationPickId ? PALETTE.text : PALETTE.muted }}
            >
              <option value="">— Pick from location library —</option>
              {locations.map((l) => (
                <option key={l.id} value={l.id}>
                  {l.name}{l.suburb ? ` · ${l.suburb}` : ''}
                </option>
              ))}
            </select>
          </div>
        )}
        <input
          name="shoot_location"
          value={shootLocationText}
          onChange={(e) => { setShootLocationText(e.target.value); setLocationPickId(''); }}
          className={inputClass}
          style={inputStyle}
          placeholder="e.g. Studio 301, Surry Hills"
        />
        {locationPickId && (
          <p className="mt-0.5 text-[10px]" style={{ color: PALETTE.accent }}>
            Pre-filled from location library — edit freely.
          </p>
        )}
      </div>

      <div className="grid gap-4 sm:grid-cols-3">
        <div>
          <label className={labelClass} style={labelStyle}>Shoot Start Date</label>
          <input name="shoot_date_start" type="date" defaultValue={initialDates.start} className={inputClass} style={inputStyle} />
        </div>
        <div>
          <label className={labelClass} style={labelStyle}>Shoot End Date</label>
          <input name="shoot_date_end" type="date" defaultValue={initialDates.end} className={inputClass} style={inputStyle} />
          <p className="mt-0.5 text-[10px]" style={{ color: PALETTE.muted }}>Leave blank for single-day shoot</p>
        </div>
        <div>
          <label className={labelClass} style={labelStyle}>Date Notes (free text)</label>
          <input name="shoot_date_notes" defaultValue={initial?.shoot_date_notes ?? ''} className={inputClass} style={inputStyle} placeholder="e.g. TBD, pending client" />
        </div>
      </div>

      {/* ── Talent Spec ─────────────────────────────────────────── */}
      <div>
        <label className={labelClass} style={labelStyle}>Talent Spec</label>
        <input name="talent_spec" defaultValue={initial?.talent_spec ?? ''} className={inputClass} style={inputStyle} placeholder="e.g. 1 photographer, 1 HMU" />
      </div>

      {/* ── Deliverables ───────────────────────────────────────── */}
      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <label className={labelClass} style={labelStyle}>Deliverables Type</label>
          <input name="deliverables_type" defaultValue={initial?.deliverables_type ?? ''} className={inputClass} style={inputStyle} placeholder="e.g. Stills + BTS video" />
        </div>
        <div>
          <label className={labelClass} style={labelStyle}>Deliverables Count</label>
          <input name="deliverables_count" type="number" min="0" defaultValue={initial?.deliverables_count ?? ''} className={inputClass} style={inputStyle} />
        </div>
      </div>

      {mode === 'edit' && (
        <div>
          <label className={labelClass} style={labelStyle}>Selects Cadence</label>
          <input name="selects_cadence" defaultValue={initial?.selects_cadence ?? ''} className={inputClass} style={inputStyle} placeholder="e.g. 1 round within 48h" />
        </div>
      )}

      {/* ── Post-Production ────────────────────────────────────── */}
      <div>
        <label className={labelClass} style={labelStyle}>Post-Production Ownership</label>
        <select name="post_production_ownership" className={inputClass} style={inputStyle} defaultValue={initial?.post_production_ownership ?? ''}>
          {POST_PROD_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
        </select>
      </div>

      {mode === 'edit' && (
        <div>
          <label className={labelClass} style={labelStyle}>Retouch Note Format</label>
          <input name="retouch_note_format" defaultValue={initial?.retouch_note_format ?? ''} className={inputClass} style={inputStyle} placeholder="e.g. Lightroom .xmp, Capture One session" />
        </div>
      )}

      {/* ── Usage ──────────────────────────────────────────────── */}
      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <label className={labelClass} style={labelStyle}>Usage Duration (months)</label>
          <input
            name="usage_duration_months"
            type="number"
            min="0"
            value={durationMonths}
            onChange={(e) => { setDurationMonths(e.target.value); setAutofilled(false); }}
            className={inputClass}
            style={inputStyle}
            placeholder="e.g. 12"
          />
        </div>
        <div>
          <label className={labelClass} style={labelStyle}>Usage Notes</label>
          <input name="usage_notes" defaultValue={initial?.usage_notes ?? ''} className={inputClass} style={inputStyle} placeholder="e.g. Digital owned, AU only" />
        </div>
      </div>

      <div>
        <div className="flex items-center gap-2 mb-1">
          <label className={labelClass} style={{ ...labelStyle, marginBottom: 0 }}>Media</label>
          {autofilled && mode === 'create' && (
            <span
              className="rounded-full px-2 py-0.5 text-[10px] font-medium"
              style={{ background: `${PALETTE.accent}15`, color: PALETTE.accent, border: `1px solid ${PALETTE.accent}30` }}
            >
              Pre-filled from recent bookings
            </span>
          )}
        </div>
        <CheckGrid options={USAGE_MEDIA_OPTIONS} selected={selectedMedia} onToggle={toggleMedia} />
      </div>

      <div>
        <label className={labelClass} style={labelStyle}>Territory</label>
        <CheckGrid options={USAGE_TERRITORY_OPTIONS} selected={selectedTerritories} onToggle={toggleTerritory} />
      </div>

      {mode === 'edit' && (
        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label className={labelClass} style={labelStyle}>Wardrobe Responsibility</label>
            <input name="wardrobe_responsibility" defaultValue={initial?.wardrobe_responsibility ?? ''} className={inputClass} style={inputStyle} placeholder="e.g. Client to supply" />
          </div>
          <div>
            <label className={labelClass} style={labelStyle}>Video References</label>
            <input name="video_references" defaultValue={initial?.video_references ?? ''} className={inputClass} style={inputStyle} placeholder="e.g. reference URLs" />
          </div>
        </div>
      )}

      {/* ── Internal Notes ─────────────────────────────────────── */}
      <div>
        <label className={labelClass} style={labelStyle}>Agency Notes (internal)</label>
        <textarea name="agency_notes" rows={2} defaultValue={initial?.agency_notes ?? ''} className={inputClass} style={inputStyle} />
      </div>

      <div>
        <label className={labelClass} style={labelStyle}>
          Raw Brief / Email
          <span className="ml-2 font-normal normal-case" style={{ color: PALETTE.muted }}>
            — source text for the Brief Parser (extracts dates, deliverables, usage automatically)
          </span>
        </label>
        <textarea name="brief_raw_text" rows={mode === 'edit' ? 6 : 4} defaultValue={initial?.brief_raw_text ?? ''} className={inputClass} style={inputStyle} />
      </div>

      <div className="flex gap-3">
        <button
          type="submit"
          disabled={submitting || (mode === 'create' && !selectedTalentId)}
          className="rounded-md px-6 py-2.5 text-sm font-medium disabled:opacity-50"
          style={{ background: PALETTE.accent, color: PALETTE.bg }}
        >
          {submitting
            ? (mode === 'create' ? 'Creating…' : 'Saving…')
            : (mode === 'create' ? 'Create Booking' : 'Save Changes')}
        </button>
        {mode === 'edit' && (
          <button
            type="button"
            onClick={() => onSuccessRedirect(undefined)}
            className="rounded-md px-6 py-2.5 text-sm font-medium"
            style={{ background: 'transparent', color: PALETTE.muted, border: `1px solid ${PALETTE.border}` }}
          >
            Cancel
          </button>
        )}
      </div>
      {mode === 'create' && !selectedTalentId && (
        <p className="text-[11px]" style={{ color: PALETTE.muted }}>Select a primary artist to create the booking.</p>
      )}
    </form>
  );
}
