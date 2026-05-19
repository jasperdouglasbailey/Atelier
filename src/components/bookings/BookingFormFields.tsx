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
  Booking, Client, Talent, Location, ArtistDiscipline,
} from '@/lib/types/database';

type Props = {
  mode: 'create' | 'edit';
  /** Booking row when editing. Ignored in create mode. */
  initial?: Partial<Booking>;
  /** Current primary artist's talent_id when editing. */
  initialPrimaryTalentId?: string | null;
  clients: Client[];
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
  talent,
  locations,
  onSubmit,
  onSuccessRedirect,
}: Props) {
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  // Artists. Create mode supports 1..N artists ("+ Add another artist"
  // pattern). Edit mode keeps the single-primary-swap shape — adding
  // artists post-creation happens through the BookingTeam panel, which
  // already supports N-artist teams.
  const [selectedTalentIds, setSelectedTalentIds] = useState<string[]>(
    initialPrimaryTalentId ? [initialPrimaryTalentId] : [],
  );
  // Picker for adding another artist in create mode. Cleared after each add.
  const [pendingPickTalentId, setPendingPickTalentId] = useState<string>('');
  // Lead artist drives tier auto-suggest + the discipline hint passed
  // to the create action for template auto-selection.
  const leadArtist = selectedTalentIds[0]
    ? (talent.find((t) => t.id === selectedTalentIds[0]) ?? null)
    : null;

  // Client / brand state with inline quick-create
  const [clients, setClients] = useState(initialClients);
  const [selectedClientId, setSelectedClientId] = useState<string>(initial?.client_id ?? '');
  const [showNewClient, setShowNewClient] = useState(false);

  // End-brand picker retired with migration 0071 — bookings no longer
  // carry a brand_id. Brands live on the campaigns surface.

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

  // Edit mode keeps the single-pick semantics. Create mode uses
  // `addTalent` / `removeTalent` (multi-pick chip list) below.
  function handleTalentChangeEdit(e: React.ChangeEvent<HTMLSelectElement>) {
    const id = e.target.value;
    setSelectedTalentIds(id ? [id] : []);
    if (id) {
      const artist = talent.find((t) => t.id === id);
      if (artist) {
        setTier((prev) => (prev === 'content' || prev === 'fashion_film') ? suggestTier(artist.discipline) : prev);
      }
    }
  }

  function addTalent(id: string) {
    if (!id) return;
    if (selectedTalentIds.includes(id)) return; // de-dupe
    const isFirst = selectedTalentIds.length === 0;
    setSelectedTalentIds((prev) => [...prev, id]);
    setPendingPickTalentId('');
    // First add seeds the tier from the lead artist's discipline.
    if (isFirst) {
      const artist = talent.find((t) => t.id === id);
      if (artist) {
        setTier((prev) => (prev === 'content' || prev === 'fashion_film') ? suggestTier(artist.discipline) : prev);
      }
    }
  }

  function removeTalent(id: string) {
    setSelectedTalentIds((prev) => prev.filter((x) => x !== id));
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

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    const formData = new FormData(e.currentTarget);

    if (mode === 'create') {
      // Multi-artist payload — JSON array of talent IDs, ordered as the
      // user added them. createBookingAction loops and inserts one
      // atelier_booking_talent row per id. Empty array = no artists
      // attached at create (operator will use BookingTeam later).
      formData.set('primary_talent_ids', JSON.stringify(selectedTalentIds));
      // Lead-artist discipline still drives template auto-select. First
      // id in the array is the lead by convention.
      if (leadArtist) formData.set('primary_talent_discipline', leadArtist.discipline);
    } else {
      // Edit mode — single-swap semantics. BookingTeam handles adds/removes.
      const single = selectedTalentIds[0] ?? '';
      if (single) formData.set('primary_talent_id', single);
      if (leadArtist) formData.set('primary_talent_discipline', leadArtist.discipline);
      const changed = (initialPrimaryTalentId ?? '') !== single;
      formData.set('primary_talent_changed', changed ? '1' : '0');
    }

    if (selectedClientId) formData.set('client_id', selectedClientId);
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

      {/* ── Artist(s) ──────────────────────────────────────────── */}
      <div>
        <label className={labelClass} style={{ ...labelStyle, fontSize: 11, fontWeight: 700, letterSpacing: '0.05em', textTransform: 'uppercase' }}>
          {mode === 'create' ? 'Artist(s) *' : 'Primary Artist'}
        </label>
        <p className="text-[11px] mb-1.5" style={{ color: PALETTE.muted }}>
          {mode === 'create'
            ? 'One or more artists this booking is built around. Add additional artists after picking the first.'
            : 'The photographer or videographer this shoot is built around. Use BookingTeam on the detail page to add more artists.'}
        </p>

        {mode === 'create' ? (
          <>
            {/* Chips — already-selected artists */}
            {selectedTalentIds.length > 0 && (
              <div className="mb-2 flex flex-wrap gap-1.5">
                {selectedTalentIds.map((id, idx) => {
                  const a = talent.find((t) => t.id === id);
                  if (!a) return null;
                  return (
                    <span
                      key={id}
                      className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-[12px] font-medium"
                      style={{ background: `${PALETTE.accent}20`, color: PALETTE.accent, border: `1px solid ${PALETTE.accent}40` }}
                    >
                      {a.working_name}
                      <span style={{ opacity: 0.7, fontSize: 10 }}>{DISCIPLINE_LABELS[a.discipline]}</span>
                      {idx === 0 && selectedTalentIds.length > 1 && (
                        <span style={{ opacity: 0.55, fontSize: 9, textTransform: 'uppercase', letterSpacing: '0.05em' }}>lead</span>
                      )}
                      <button
                        type="button"
                        onClick={() => removeTalent(id)}
                        aria-label={`Remove ${a.working_name}`}
                        style={{
                          background: 'transparent',
                          border: 'none',
                          color: PALETTE.accent,
                          cursor: 'pointer',
                          fontSize: 14,
                          lineHeight: 1,
                          padding: '0 2px',
                          marginLeft: 2,
                        }}
                      >
                        ×
                      </button>
                    </span>
                  );
                })}
              </div>
            )}

            {/* Picker — adds to the chip list */}
            <select
              value={pendingPickTalentId}
              onChange={(e) => addTalent(e.target.value)}
              className={inputClass}
              style={inputStyle}
              required={selectedTalentIds.length === 0}
            >
              <option value="">
                {selectedTalentIds.length === 0 ? '— Select artist —' : '+ Add another artist'}
              </option>
              {artistGroups.map(({ label, artists }) => (
                <optgroup key={label} label={label}>
                  {artists
                    .filter((t) => !selectedTalentIds.includes(t.id))
                    .map((t) => (
                      <option key={t.id} value={t.id}>
                        {t.working_name}{t.specialty ? ` · ${t.specialty}` : ''}
                      </option>
                    ))}
                </optgroup>
              ))}
              {inactiveArtists.length > 0 && (
                <optgroup label="Inactive">
                  {inactiveArtists
                    .filter((t) => !selectedTalentIds.includes(t.id))
                    .map((t) => (
                      <option key={t.id} value={t.id}>{t.working_name} (inactive)</option>
                    ))}
                </optgroup>
              )}
            </select>
          </>
        ) : (
          // Edit mode keeps the single-pick UX. Adds/removes happen on BookingTeam.
          <select
            value={selectedTalentIds[0] ?? ''}
            onChange={handleTalentChangeEdit}
            className={inputClass}
            style={{ ...inputStyle, fontWeight: selectedTalentIds[0] ? 500 : undefined }}
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
        )}

        {mode === 'edit' && initialPrimaryTalentId && (selectedTalentIds[0] ?? '') !== initialPrimaryTalentId && (
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
          {mode === 'create' && leadArtist && (
            <span className="ml-2 font-normal normal-case" style={{ color: PALETTE.muted }}>
              — suggested from lead artist discipline
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
                  address: null,
                  address_physical: null,
                  postal_address: null,
                  tags: null,
                  xero_contact_id: null,
                  important_note: null,
                  primary_contact_email: null,
                  contacts: [],
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
      </div>

      {mode === 'create' && (
        <div>
          <label className={labelClass} style={labelStyle}>Agency (if different from billing client)</label>
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
          disabled={submitting || (mode === 'create' && selectedTalentIds.length === 0)}
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
      {mode === 'create' && selectedTalentIds.length === 0 && (
        <p className="text-[11px]" style={{ color: PALETTE.muted }}>Select at least one artist to create the booking.</p>
      )}
    </form>
  );
}
