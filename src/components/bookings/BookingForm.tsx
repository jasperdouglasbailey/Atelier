'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { createBookingAction } from '@/app/actions/bookings';
import { createClientAction, createBrandAction } from '@/app/actions/entities';
import { SHOOT_TIERS, SHOOT_TIER_LABELS, PALETTE } from '@/lib/utils/constants';
import type { Client, Brand, UsageMedia, UsageTerritory } from '@/lib/types/database';

type Props = {
  clients: Client[];
  brands: Brand[];
};

const inputClass = 'w-full rounded-md border bg-transparent px-3 py-2 text-sm';
const inputStyle = { borderColor: PALETTE.border, color: PALETTE.text, background: PALETTE.bg };
const labelClass = 'block text-xs font-medium mb-1';
const labelStyle = { color: PALETTE.muted };

const QUICK_CREATE_VALUE = '__new__';

/** Compact inline form that appears when "Create new" is chosen from a dropdown. */
function QuickCreateForm({
  type,
  onCreated,
  onCancel,
}: {
  type: 'client' | 'brand';
  onCreated: (id: string, label: string) => void;
  onCancel: () => void;
}) {
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setSaving(true);
    setErr(null);
    const fd = new FormData(e.currentTarget);
    if (type === 'client') {
      const result = await createClientAction(fd);
      if ('error' in result) { setErr(result.error ?? 'Failed'); setSaving(false); return; }
      const name = fd.get('name') as string;
      const company = fd.get('company') as string;
      onCreated(result.id, company ? `${name} (${company})` : name);
    } else {
      const result = await createBrandAction(fd);
      if ('error' in result) { setErr(result.error ?? 'Failed'); setSaving(false); return; }
      onCreated(result.id, result.name);
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
          {saving ? 'Saving...' : `Add ${type === 'client' ? 'client' : 'brand'}`}
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

const POST_PROD_OPTIONS = [
  { value: '', label: '— Not set —' },
  { value: 'us_via_artist', label: 'Us via artist' },
  { value: 'us_via_post_team', label: 'Us via post team' },
  { value: 'client_in_house', label: 'Client in-house' },
  { value: 'client_outsourced', label: 'Client outsourced' },
];

const USAGE_MEDIA_OPTIONS: { value: UsageMedia; label: string }[] = [
  { value: 'all_media', label: 'All Media' }, { value: 'all_print', label: 'All Print' }, { value: 'all_digital', label: 'All Digital' },
  { value: 'ooh', label: 'OOH / Billboards' }, { value: 'press', label: 'Press' }, { value: 'social_media', label: 'Social Media' },
  { value: 'company_website', label: 'Website' }, { value: 'internet_advertising', label: 'Internet Ads' },
  { value: 'packaging', label: 'Packaging' }, { value: 'pos', label: 'POS' }, { value: 'tv', label: 'TV / Broadcast' },
  { value: 'brochures', label: 'Brochures' }, { value: 'collateral', label: 'Collateral' }, { value: 'ambient', label: 'Ambient' },
];

const USAGE_TERRITORY_OPTIONS: { value: UsageTerritory; label: string }[] = [
  { value: 'worldwide', label: 'Worldwide' }, { value: 'australia', label: 'Australia' }, { value: 'oceania', label: 'Oceania' },
  { value: 'usa', label: 'USA' }, { value: 'north_america', label: 'North America' },
  { value: 'europe_all', label: 'Europe (all)' }, { value: 'uk', label: 'UK' },
  { value: 'asia_incl_japan', label: 'Asia (incl. Japan)' }, { value: 'middle_east', label: 'Middle East' }, { value: 'emea', label: 'EMEA' },
];

export default function BookingForm({ clients: initialClients, brands: initialBrands }: Props) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  // Client state
  const [clients, setClients] = useState(initialClients);
  const [selectedClientId, setSelectedClientId] = useState('');
  const [showNewClient, setShowNewClient] = useState(false);

  // Brand state
  const [brands, setBrands] = useState(initialBrands);
  const [selectedBrandId, setSelectedBrandId] = useState('');
  const [showNewBrand, setShowNewBrand] = useState(false);

  // Usage arrays
  const [selectedMedia, setSelectedMedia] = useState<Set<UsageMedia>>(new Set());
  const [selectedTerritories, setSelectedTerritories] = useState<Set<UsageTerritory>>(new Set());
  function toggleMedia(v: UsageMedia) { setSelectedMedia((p) => { const n = new Set(p); n.has(v) ? n.delete(v) : n.add(v); return n; }); }
  function toggleTerritory(v: UsageTerritory) { setSelectedTerritories((p) => { const n = new Set(p); n.has(v) ? n.delete(v) : n.add(v); return n; }); }

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
    if (e.target.value === QUICK_CREATE_VALUE) {
      setShowNewBrand(true);
      setSelectedBrandId('');
    } else {
      setShowNewBrand(false);
      setSelectedBrandId(e.target.value);
    }
  }

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    const formData = new FormData(e.currentTarget);
    // Inject controlled IDs (dropdowns are controlled so FormData won't pick them up reliably)
    if (selectedClientId) formData.set('client_id', selectedClientId);
    if (selectedBrandId) formData.set('brand_id', selectedBrandId);
    formData.set('usage_media', JSON.stringify([...selectedMedia]));
    formData.set('usage_territory', JSON.stringify([...selectedTerritories]));
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
              onCreated={(id, label) => {
                setClients((prev) => [...prev, { id, name: label, company: null } as Client]);
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
              onCreated={(id, label) => {
                setBrands((prev) => [...prev, { id, name: label } as Brand]);
                setSelectedBrandId(id);
                setShowNewBrand(false);
              }}
              onCancel={() => { setShowNewBrand(false); setSelectedBrandId(''); }}
            />
          )}
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
      <div>
        <label className={labelClass} style={labelStyle}>Talent Spec</label>
        <input name="talent_spec" className={inputClass} style={inputStyle} placeholder="e.g. 1 photographer, 1 HMU" />
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

      {/* Post-production ownership */}
      <div>
        <label className={labelClass} style={labelStyle}>Post-Production Ownership</label>
        <select name="post_production_ownership" className={inputClass} style={inputStyle} defaultValue="">
          {POST_PROD_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
        </select>
      </div>

      {/* Usage */}
      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <label className={labelClass} style={labelStyle}>Usage Duration (months)</label>
          <input name="usage_duration_months" type="number" min="0" className={inputClass} style={inputStyle} placeholder="e.g. 12" />
        </div>
        <div>
          <label className={labelClass} style={labelStyle}>Usage Notes</label>
          <input name="usage_notes" className={inputClass} style={inputStyle} placeholder="e.g. Digital owned, AU only" />
        </div>
      </div>

      <div>
        <label className={labelClass} style={labelStyle}>Media</label>
        <div className="mt-1 grid grid-cols-2 gap-1 sm:grid-cols-3">
          {USAGE_MEDIA_OPTIONS.map(({ value, label }) => {
            const active = selectedMedia.has(value);
            return (
              <label key={value} className="flex items-center gap-2 cursor-pointer rounded px-2 py-1.5 text-xs select-none" style={{ background: active ? `${PALETTE.accent}18` : 'transparent', color: active ? PALETTE.accent : PALETTE.muted, border: `1px solid ${active ? PALETTE.accent + '44' : PALETTE.border}` }}>
                <input type="checkbox" className="accent-blue-400 flex-shrink-0" checked={active} onChange={() => toggleMedia(value)} />
                {label}
              </label>
            );
          })}
        </div>
      </div>

      <div>
        <label className={labelClass} style={labelStyle}>Territory</label>
        <div className="mt-1 grid grid-cols-2 gap-1 sm:grid-cols-3">
          {USAGE_TERRITORY_OPTIONS.map(({ value, label }) => {
            const active = selectedTerritories.has(value);
            return (
              <label key={value} className="flex items-center gap-2 cursor-pointer rounded px-2 py-1.5 text-xs select-none" style={{ background: active ? `${PALETTE.accent}18` : 'transparent', color: active ? PALETTE.accent : PALETTE.muted, border: `1px solid ${active ? PALETTE.accent + '44' : PALETTE.border}` }}>
                <input type="checkbox" className="accent-blue-400 flex-shrink-0" checked={active} onChange={() => toggleTerritory(value)} />
                {label}
              </label>
            );
          })}
        </div>
      </div>

      {/* Raw brief */}
      <div>
        <label className={labelClass} style={labelStyle}>
          Raw Brief / Email
          <span className="ml-2 font-normal normal-case" style={{ color: '#666' }}>— paste source email for the Brief Parser to auto-fill fields</span>
        </label>
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
