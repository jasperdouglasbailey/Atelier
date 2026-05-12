'use client';

import { useState, useMemo } from 'react';
import Link from 'next/link';
import { PALETTE, CREW_TIER_LABELS, CREW_ROLES } from '@/lib/utils/constants';
import { humanise } from '@/lib/utils/humanise';
import { orderCityKeys, NO_CITY_KEY } from '@/lib/utils/city-order';
import CollapsibleCityGroup from '@/components/entities/CollapsibleCityGroup';
import type { Crew, CrewTier } from '@/lib/types/database';

type Props = {
  allCrew: Crew[];
  defaultGroupByCity: boolean;
  cities: string[];
};

const RATE_BANDS = [
  { label: 'Any rate', min: null, max: null },
  { label: 'Under $500', min: null, max: 499 },
  { label: '$500–$800', min: 500, max: 800 },
  { label: '$800–$1200', min: 801, max: 1200 },
  { label: '$1200+', min: 1201, max: null },
];

const tierColor = (tier: string) => {
  if (tier === 'preferred_core') return PALETTE.success;
  if (tier === 'never_again') return PALETTE.danger;
  return PALETTE.muted;
};

function CrewCard({ c, showCity }: { c: Crew; showCity: boolean }) {
  return (
    <Link
      href={`/crew/${c.id}`}
      className="block rounded-lg border p-4 transition hover:border-opacity-80"
      style={{ background: PALETTE.surface, borderColor: PALETTE.border }}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="text-sm font-medium" style={{ color: PALETTE.text }}>{c.name}</div>
        <span
          className="rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase shrink-0"
          style={{ background: `${tierColor(c.tier)}22`, color: tierColor(c.tier) }}
        >
          {CREW_TIER_LABELS[c.tier]}
        </span>
      </div>
      {c.primary_role && (
        <div className="mt-1 text-xs" style={{ color: PALETTE.accent }}>
          {[c.primary_role, ...(c.secondary_roles ?? [])].map(humanise).join(' / ')}
        </div>
      )}
      <div className="mt-2 space-y-0.5 text-xs" style={{ color: PALETTE.muted }}>
        {showCity && c.city && <div>{c.city}</div>}
        {c.email && <div className="truncate">{c.email}</div>}
        {c.mobile && <div>{c.mobile}</div>}
        {c.default_day_rate && <div>Day rate: ${c.default_day_rate}</div>}
      </div>
      <div className="mt-2 flex flex-wrap gap-1.5 text-[10px]">
        {c.gst_registered && (
          <span className="rounded-full border px-2 py-0.5" style={{ borderColor: PALETTE.border, color: PALETTE.muted }}>GST</span>
        )}
        {!c.onboarding_completed && (
          <span className="rounded-full border px-2 py-0.5" style={{ borderColor: PALETTE.warning, color: PALETTE.warning }}>Onboarding pending</span>
        )}
        {c.dietary && c.dietary.toUpperCase() !== 'NIL' && c.dietary.toUpperCase() !== 'NIL DIET' && (
          <span className="rounded-full border px-2 py-0.5" style={{ borderColor: PALETTE.border, color: PALETTE.muted }}>Dietary: {c.dietary}</span>
        )}
      </div>
    </Link>
  );
}

export default function CrewClient({ allCrew, defaultGroupByCity, cities }: Props) {
  const [search, setSearch] = useState('');
  const [tier, setTier] = useState('');
  const [city, setCity] = useState('');
  const [role, setRole] = useState('');
  const [rateBand, setRateBand] = useState(0);
  const [groupByCity, setGroupByCity] = useState(defaultGroupByCity);

  const filtered = useMemo(() => {
    const q = search.toLowerCase().trim();
    const band = RATE_BANDS[rateBand];

    return allCrew.filter((c) => {
      if (q) {
        const hay = [c.name, c.primary_role, ...(c.secondary_roles ?? []), c.email, c.city]
          .filter(Boolean).join(' ').toLowerCase();
        if (!hay.includes(q)) return false;
      }
      if (tier && c.tier !== tier) return false;
      if (city && c.city !== city) return false;
      if (role) {
        const roles = [c.primary_role, ...(c.secondary_roles ?? [])];
        if (!roles.includes(role)) return false;
      }
      if (band.min !== null && (c.default_day_rate ?? 0) < band.min) return false;
      if (band.max !== null && (c.default_day_rate ?? 0) > band.max) return false;
      return true;
    });
  }, [allCrew, search, tier, city, role, rateBand]);

  const grouped: Record<string, Crew[]> = {};
  if (groupByCity && !city) {
    for (const c of filtered) {
      const key = c.city ?? NO_CITY_KEY;
      (grouped[key] ??= []).push(c);
    }
  }
  const groupKeys = orderCityKeys(
    Object.keys(grouped).map((k) => ({ key: k, count: grouped[k].length })),
  );

  const hasFilters = search || tier || city || role || rateBand > 0;

  return (
    <>
      {/* Filter row */}
      <div className="mb-4 flex flex-wrap items-end gap-2">
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search by name or role…"
          className="min-w-0 flex-1 rounded-md border bg-transparent px-3 py-2 text-sm sm:max-w-xs"
          style={{ borderColor: PALETTE.border, color: PALETTE.text }}
        />
        <select
          value={city}
          onChange={(e) => setCity(e.target.value)}
          className="rounded-md border bg-transparent px-3 py-2 text-sm"
          style={{ borderColor: PALETTE.border, color: PALETTE.text, background: PALETTE.bg }}
        >
          <option value="">All cities</option>
          {cities.map((c) => <option key={c} value={c}>{c}</option>)}
        </select>
        <select
          value={tier}
          onChange={(e) => setTier(e.target.value)}
          className="rounded-md border bg-transparent px-3 py-2 text-sm"
          style={{ borderColor: PALETTE.border, color: PALETTE.text, background: PALETTE.bg }}
        >
          <option value="">All tiers</option>
          {Object.entries(CREW_TIER_LABELS).map(([k, v]) => (
            <option key={k} value={k}>{v}</option>
          ))}
        </select>
        <select
          value={role}
          onChange={(e) => setRole(e.target.value)}
          className="rounded-md border bg-transparent px-3 py-2 text-sm"
          style={{ borderColor: PALETTE.border, color: PALETTE.text, background: PALETTE.bg }}
        >
          <option value="">All roles</option>
          {CREW_ROLES.map((r) => (
            <option key={r} value={r}>{humanise(r)}</option>
          ))}
        </select>
        <select
          value={rateBand}
          onChange={(e) => setRateBand(Number(e.target.value))}
          className="rounded-md border bg-transparent px-3 py-2 text-sm"
          style={{ borderColor: PALETTE.border, color: PALETTE.text, background: PALETTE.bg }}
        >
          {RATE_BANDS.map((b, i) => (
            <option key={i} value={i}>{b.label}</option>
          ))}
        </select>
        {hasFilters && (
          <button
            type="button"
            onClick={() => { setSearch(''); setTier(''); setCity(''); setRole(''); setRateBand(0); }}
            className="text-xs underline"
            style={{ color: PALETTE.muted }}
          >
            Clear
          </button>
        )}
        <span className="text-xs ml-auto" style={{ color: PALETTE.muted }}>
          {filtered.length} crew member{filtered.length !== 1 ? 's' : ''}
        </span>
      </div>

      {/* Group / flat toggle */}
      {!city && cities.length > 0 && (
        <div className="mb-4 flex items-center gap-1 text-[11px]" style={{ color: PALETTE.muted }}>
          <span>View:</span>
          <button type="button" onClick={() => setGroupByCity(true)} className="rounded px-2 py-0.5" style={{ background: groupByCity ? `${PALETTE.accent}22` : 'transparent', color: groupByCity ? PALETTE.accent : PALETTE.muted }}>Grouped by city</button>
          <button type="button" onClick={() => setGroupByCity(false)} className="rounded px-2 py-0.5" style={{ background: !groupByCity ? `${PALETTE.accent}22` : 'transparent', color: !groupByCity ? PALETTE.accent : PALETTE.muted }}>Flat list</button>
        </div>
      )}

      {filtered.length === 0 ? (
        <div className="py-12 text-center text-sm" style={{ color: PALETTE.muted }}>
          No crew match these filters.
        </div>
      ) : groupByCity && !city ? (
        <div className="space-y-6">
          {groupKeys.map((key) => (
            <CollapsibleCityGroup
              key={key}
              storageKey={`crew:${key}`}
              label={key === NO_CITY_KEY ? 'No city set' : key}
              count={grouped[key].length}
              countLabel="member"
            >
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {grouped[key].map((c) => <CrewCard key={c.id} c={c} showCity={false} />)}
              </div>
            </CollapsibleCityGroup>
          ))}
        </div>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {filtered.map((c) => <CrewCard key={c.id} c={c} showCity={!groupByCity || Boolean(city)} />)}
        </div>
      )}
    </>
  );
}
