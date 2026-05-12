'use client';

import { useState, useMemo } from 'react';
import Link from 'next/link';
import { PALETTE } from '@/lib/utils/constants';
import { FACILITY_OPTIONS } from './LocationForm';
import type { Location, StudioType } from '@/lib/types/database';

const STUDIO_TYPE_LABELS: Record<StudioType, string> = {
  photo_studio: 'Photo Studio',
  film_studio: 'Film Studio',
  outdoor: 'Outdoor',
  retail: 'Retail',
  residential: 'Residential',
  venue: 'Venue',
  other: 'Other',
};

function formatRate(half: number | null, full: number | null) {
  if (!half && !full) return null;
  const parts: string[] = [];
  if (half) parts.push(`$${half.toLocaleString()} half`);
  if (full) parts.push(`$${full.toLocaleString()} full`);
  return parts.join(' · ');
}

const FACILITY_LABEL: Record<string, string> = Object.fromEntries(
  FACILITY_OPTIONS.map((f) => [f.value, f.label]),
);

type Props = {
  locations: Location[];
};

export default function LocationsClient({ locations }: Props) {
  const [search, setSearch] = useState('');
  const [activeFacilities, setActiveFacilities] = useState<Set<string>>(new Set());

  const toggleFacility = (f: string) => {
    setActiveFacilities((prev) => {
      const next = new Set(prev);
      if (next.has(f)) next.delete(f);
      else next.add(f);
      return next;
    });
  };

  const { filtered, facilityOptions } = useMemo(() => {
    // Collect only facilities that appear in at least one active location
    const usedFacilities = new Set<string>();
    for (const loc of locations) {
      for (const f of loc.facilities ?? []) usedFacilities.add(f);
    }
    const facilityOptions = FACILITY_OPTIONS.filter((f) => usedFacilities.has(f.value));

    const q = search.toLowerCase().trim();
    const filtered = locations.filter((loc) => {
      if (q) {
        const hay = [loc.name, loc.alias, loc.suburb, loc.address, loc.state]
          .filter(Boolean).join(' ').toLowerCase();
        if (!hay.includes(q)) return false;
      }
      for (const f of activeFacilities) {
        if (!(loc.facilities ?? []).includes(f)) return false;
      }
      return true;
    });

    return { filtered, facilityOptions };
  }, [locations, search, activeFacilities]);

  const active = filtered.filter((l) => l.is_active);
  const inactive = filtered.filter((l) => !l.is_active);
  const hasFilters = search || activeFacilities.size > 0;

  return (
    <>
      {/* Search + facility chips */}
      <div className="mb-5 space-y-3">
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search by name or suburb…"
          className="w-full max-w-sm rounded-md border bg-transparent px-3 py-2 text-sm"
          style={{ borderColor: PALETTE.border, color: PALETTE.text }}
        />

        {facilityOptions.length > 0 && (
          <div className="flex flex-wrap gap-1.5">
            {facilityOptions.map((f) => {
              const on = activeFacilities.has(f.value);
              return (
                <button
                  key={f.value}
                  type="button"
                  onClick={() => toggleFacility(f.value)}
                  className="rounded-full px-3 py-0.5 text-[11px] font-medium transition"
                  style={{
                    background: on ? PALETTE.accent : `${PALETTE.accent}18`,
                    color: on ? PALETTE.bg : PALETTE.accent,
                    border: `1px solid ${on ? PALETTE.accent : 'transparent'}`,
                  }}
                >
                  {f.label}
                </button>
              );
            })}
            {activeFacilities.size > 0 && (
              <button
                type="button"
                onClick={() => setActiveFacilities(new Set())}
                className="rounded-full px-3 py-0.5 text-[11px]"
                style={{ color: PALETTE.muted }}
              >
                Clear filters
              </button>
            )}
          </div>
        )}

        {hasFilters && (
          <p className="text-xs" style={{ color: PALETTE.muted }}>
            {filtered.length} location{filtered.length !== 1 ? 's' : ''} match
          </p>
        )}
      </div>

      {active.length > 0 && (
        <div className="grid gap-3 sm:grid-cols-2">
          {active.map((loc) => {
            const rate = formatRate(loc.half_day_rate, loc.full_day_rate);
            return (
              <Link
                key={loc.id}
                href={`/locations/${loc.id}`}
                className="block rounded-lg border p-4 hover:border-opacity-80 transition"
                style={{ background: PALETTE.surface, borderColor: PALETTE.border }}
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0 flex-1">
                    <div className="font-medium text-sm truncate" style={{ color: PALETTE.text }}>{loc.name}</div>
                    {loc.alias && (
                      <div className="text-[11px] mt-0.5" style={{ color: PALETTE.muted }}>{loc.alias}</div>
                    )}
                  </div>
                  <span
                    className="flex-shrink-0 rounded-full px-2 py-0.5 text-[10px] font-medium"
                    style={{ background: `${PALETTE.accent}18`, color: PALETTE.accent }}
                  >
                    {STUDIO_TYPE_LABELS[loc.studio_type]}
                  </span>
                </div>

                <div className="mt-2 space-y-0.5">
                  {(loc.suburb || loc.address) && (
                    <div className="text-[11px] truncate" style={{ color: PALETTE.muted }}>
                      {loc.suburb ? `${loc.suburb}, ${loc.state}` : loc.address}
                    </div>
                  )}
                  {rate && (
                    <div className="text-[11px]" style={{ color: PALETTE.muted }}>{rate}</div>
                  )}
                  {loc.contact_name && (
                    <div className="text-[11px]" style={{ color: PALETTE.muted }}>Contact: {loc.contact_name}</div>
                  )}
                </div>

                <div className="mt-2 flex flex-wrap gap-1.5 text-[10px]">
                  {loc.studio_rooms && loc.studio_rooms.length > 0 && (
                    <span className="rounded-full px-2 py-0.5" style={{ background: `${PALETTE.accent}18`, color: PALETTE.accent }}>
                      {loc.studio_rooms.length} room{loc.studio_rooms.length !== 1 ? 's' : ''}
                    </span>
                  )}
                  {loc.drive_folder_link && (
                    <span className="rounded-full px-2 py-0.5" style={{ background: `${PALETTE.success}18`, color: PALETTE.success }}>
                      Drive folder
                    </span>
                  )}
                  {(loc.facilities ?? []).filter((f) => activeFacilities.has(f)).map((f) => (
                    <span key={f} className="rounded-full px-2 py-0.5" style={{ background: `${PALETTE.accent}30`, color: PALETTE.accent }}>
                      {FACILITY_LABEL[f] ?? f}
                    </span>
                  ))}
                </div>
              </Link>
            );
          })}
        </div>
      )}

      {inactive.length > 0 && (
        <div className="mt-8">
          <h2 className="text-xs font-semibold uppercase tracking-wide mb-3" style={{ color: PALETTE.muted }}>
            Inactive ({inactive.length})
          </h2>
          <div className="grid gap-2 sm:grid-cols-2">
            {inactive.map((loc) => (
              <Link
                key={loc.id}
                href={`/locations/${loc.id}`}
                className="block rounded border px-4 py-3 opacity-60"
                style={{ borderColor: PALETTE.border }}
              >
                <span className="text-sm" style={{ color: PALETTE.muted }}>{loc.name}</span>
              </Link>
            ))}
          </div>
        </div>
      )}

      {filtered.length === 0 && (
        <div className="py-12 text-center text-sm" style={{ color: PALETTE.muted }}>
          No locations match{activeFacilities.size > 0 ? ' these filters' : ' this search'}.
        </div>
      )}
    </>
  );
}
