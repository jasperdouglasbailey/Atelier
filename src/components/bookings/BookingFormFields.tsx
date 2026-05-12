'use client';

/**
 * BookingFormFields — single source of truth for the new + edit booking forms.
 *
 * Both /bookings/new and /bookings/[id]/edit render this component and supply
 * a different `onSubmit` handler. Field layout, validation, artist/location
 * pickers are defined here once. Usage is managed via UsageLicenceBuilder on
 * the booking detail page — not in this form.
 *
 * For edit mode, pass `initial` (the Booking row) and `initialPrimaryTalentId`
 * (the current primary booking_talent talent_id, if any). The submit handler
 * for edit will receive `primary_talent_id` in the FormData if changed.
 */

import { useState } from 'react';
import { dateRangeToInputs } from '@/lib/utils/daterange';
import { SHOOT_TIERS, SHOOT_TIER_LABELS, PALETTE } from '@/lib/utils/constants';
import QuickCreateForm from '@/components/bookings/QuickCreateForm';
import type {
  Booking, Client, Brand, Talent, Location, ArtistDiscipline,
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


function suggestTier(discipline: ArtistDiscipline | null): string {
  if (discipline === 'videographer') return 'fashion_film';
  return 'content';
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
    if (e.target.value === QUICK_CREATE_VALUE) {
      setShowNewClient(true);
      setSelectedClientId('');
    } else {
      setShowNewClient(false);
      setSelectedClientId(e.target.value);
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
                  address: null, contacts: [],
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

      {/* ── Call / Wrap times ───────────────────────────────────── */}
      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <label className={labelClass} style={labelStyle}>Call Time</label>
          <input name="call_time" type="time" defaultValue={initial?.call_time ?? ''} className={inputClass} style={inputStyle} />
          <p className="mt-0.5 text-[10px]" style={{ color: PALETTE.muted }}>When the crew is needed on set.</p>
        </div>
        <div>
          <label className={labelClass} style={labelStyle}>Wrap Time</label>
          <input name="wrap_time" type="time" defaultValue={initial?.wrap_time ?? ''} className={inputClass} style={inputStyle} />
          <p className="mt-0.5 text-[10px]" style={{ color: PALETTE.muted }}>Planned finish — drives the overtime threshold.</p>
        </div>
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
          <label className={labelClass} style={labelStyle}>Selects Due</label>
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

      {/* ── Production Contact ─────────────────────────────────── */}
      <div>
        <label className={labelClass} style={{ ...labelStyle, fontSize: 11, fontWeight: 700, letterSpacing: '0.05em', textTransform: 'uppercase' }}>
          Production Contact
        </label>
        <p className="text-[11px] mb-2" style={{ color: PALETTE.muted }}>
          Direct contact at the client or agency for this shoot — used on call sheets and chasers.
        </p>
        <div className="grid gap-3 sm:grid-cols-3">
          <div>
            <label className={labelClass} style={labelStyle}>Name</label>
            <input name="producer_name" defaultValue={initial?.producer_name ?? ''} className={inputClass} style={inputStyle} placeholder="e.g. Sam Davies" />
          </div>
          <div>
            <label className={labelClass} style={labelStyle}>Email</label>
            <input name="producer_email" type="email" defaultValue={initial?.producer_email ?? ''} className={inputClass} style={inputStyle} />
          </div>
          <div>
            <label className={labelClass} style={labelStyle}>Phone</label>
            <input name="producer_phone" defaultValue={initial?.producer_phone ?? ''} className={inputClass} style={inputStyle} />
          </div>
        </div>
      </div>

      {/* ── Confirmation Deadline ──────────────────────────────── */}
      <div>
        <label className={labelClass} style={labelStyle}>Confirmation Deadline</label>
        <input name="confirmation_deadline" type="date" defaultValue={initial?.confirmation_deadline ?? ''} className={inputClass} style={inputStyle} />
        <p className="mt-0.5 text-[10px]" style={{ color: PALETTE.muted }}>Date the client must confirm by — quote releases if missed.</p>
      </div>

      {/* ── Invoicing ──────────────────────────────────────────── */}
      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <label className={labelClass} style={labelStyle}>PO Number</label>
          <input name="po_number" defaultValue={initial?.po_number ?? ''} className={inputClass} style={inputStyle} placeholder="Client's purchase order number" />
        </div>
        <div>
          <label className={labelClass} style={labelStyle}>Job Number</label>
          <input name="job_number" defaultValue={initial?.job_number ?? ''} className={inputClass} style={inputStyle} placeholder="Client or internal job number" />
        </div>
      </div>

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
