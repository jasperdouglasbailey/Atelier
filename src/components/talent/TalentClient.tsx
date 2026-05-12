'use client';

import { useState, useMemo } from 'react';
import Link from 'next/link';
import { PALETTE, ARTIST_DISCIPLINE_LABELS } from '@/lib/utils/constants';
import { orderCityKeys, NO_CITY_KEY } from '@/lib/utils/city-order';
import CollapsibleCityGroup from '@/components/entities/CollapsibleCityGroup';
import type { Talent, ArtistDiscipline } from '@/lib/types/database';

type Props = {
  allTalent: Talent[];
  defaultGroupByCity: boolean;
};

function TalentCard({ t, showCity }: { t: Talent; showCity: boolean }) {
  return (
    <Link
      href={`/talent/${t.id}`}
      className="block rounded-lg border p-4 transition hover:border-opacity-80"
      style={{ background: PALETTE.surface, borderColor: PALETTE.border }}
    >
      <div className="flex items-start justify-between">
        <div>
          <div className="text-sm font-medium" style={{ color: PALETTE.text }}>{t.working_name}</div>
          <div className="text-[11px]" style={{ color: PALETTE.muted }}>
            {ARTIST_DISCIPLINE_LABELS[t.discipline as ArtistDiscipline] ?? t.discipline}
            {t.specialty ? ` · ${t.specialty}` : ''}
          </div>
        </div>
        {!t.is_active && (
          <span className="rounded-full px-2 py-0.5 text-[10px]" style={{ background: `${PALETTE.danger}22`, color: PALETTE.danger }}>Inactive</span>
        )}
      </div>
      <div className="mt-2 space-y-0.5 text-xs" style={{ color: PALETTE.muted }}>
        {showCity && t.city && <div>{t.city}</div>}
        {t.email && <div>{t.email}</div>}
        {t.mobile && <div>{t.mobile}</div>}
        {t.instagram && <div>@{t.instagram}</div>}
      </div>
      <div className="mt-2 flex gap-2 text-[10px]">
        {t.gst_registered && (
          <span className="rounded-full border px-2 py-0.5" style={{ borderColor: PALETTE.border, color: PALETTE.muted }}>GST</span>
        )}
        {t.representation_status === 'exclusive' && (
          <span className="rounded-full border px-2 py-0.5" style={{ borderColor: PALETTE.accent, color: PALETTE.accent }}>Exclusive</span>
        )}
        {!t.onboarding_completed && (
          <span className="rounded-full border px-2 py-0.5" style={{ borderColor: PALETTE.warning, color: PALETTE.warning }}>Onboarding pending</span>
        )}
      </div>
    </Link>
  );
}

export default function TalentClient({ allTalent, defaultGroupByCity }: Props) {
  const [search, setSearch] = useState('');
  const [discipline, setDiscipline] = useState('');
  const [groupByCity, setGroupByCity] = useState(defaultGroupByCity);

  const filtered = useMemo(() => {
    const q = search.toLowerCase().trim();
    return allTalent.filter((t) => {
      if (q) {
        const hay = [t.working_name, t.legal_name, t.specialty, t.email, t.city, t.instagram]
          .filter(Boolean).join(' ').toLowerCase();
        if (!hay.includes(q)) return false;
      }
      if (discipline && t.discipline !== discipline) return false;
      return true;
    });
  }, [allTalent, search, discipline]);

  const hasAnyCity = allTalent.some((t) => Boolean(t.city));

  const grouped: Record<string, Talent[]> = {};
  if (groupByCity && hasAnyCity) {
    for (const t of filtered) {
      const key = t.city ?? NO_CITY_KEY;
      (grouped[key] ??= []).push(t);
    }
  }
  const groupKeys = orderCityKeys(
    Object.keys(grouped).map((k) => ({ key: k, count: grouped[k].length })),
  );

  const hasFilters = search || discipline;

  return (
    <>
      {/* Filter row */}
      <div className="mb-4 flex flex-wrap items-end gap-2">
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search by name or specialty…"
          className="min-w-0 flex-1 rounded-md border bg-transparent px-3 py-2 text-sm sm:max-w-xs"
          style={{ borderColor: PALETTE.border, color: PALETTE.text }}
        />
        <select
          value={discipline}
          onChange={(e) => setDiscipline(e.target.value)}
          className="rounded-md border bg-transparent px-3 py-2 text-sm"
          style={{ borderColor: PALETTE.border, color: PALETTE.text, background: PALETTE.bg }}
        >
          <option value="">All disciplines</option>
          {Object.entries(ARTIST_DISCIPLINE_LABELS).map(([k, v]) => (
            <option key={k} value={k}>{v}</option>
          ))}
        </select>
        {hasFilters && (
          <button
            type="button"
            onClick={() => { setSearch(''); setDiscipline(''); }}
            className="text-xs underline"
            style={{ color: PALETTE.muted }}
          >
            Clear
          </button>
        )}
        <span className="text-xs ml-auto" style={{ color: PALETTE.muted }}>
          {filtered.length} artist{filtered.length !== 1 ? 's' : ''}
        </span>
      </div>

      {/* Group / flat toggle */}
      {hasAnyCity && (
        <div className="mb-4 flex items-center gap-1 text-[11px]" style={{ color: PALETTE.muted }}>
          <span>View:</span>
          <button type="button" onClick={() => setGroupByCity(true)} className="rounded px-2 py-0.5" style={{ background: groupByCity ? `${PALETTE.accent}22` : 'transparent', color: groupByCity ? PALETTE.accent : PALETTE.muted }}>Grouped by city</button>
          <button type="button" onClick={() => setGroupByCity(false)} className="rounded px-2 py-0.5" style={{ background: !groupByCity ? `${PALETTE.accent}22` : 'transparent', color: !groupByCity ? PALETTE.accent : PALETTE.muted }}>Flat list</button>
        </div>
      )}

      {filtered.length === 0 ? (
        <div className="py-12 text-center text-sm" style={{ color: PALETTE.muted }}>
          {hasFilters ? 'No talent match these filters.' : 'No talent yet. Add your first artist to get started.'}
        </div>
      ) : groupByCity && hasAnyCity ? (
        <div className="space-y-6">
          {groupKeys.map((key) => (
            <CollapsibleCityGroup
              key={key}
              storageKey={`talent:${key}`}
              label={key === NO_CITY_KEY ? 'No city set' : key}
              count={grouped[key].length}
              countLabel="artist"
            >
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {grouped[key].map((t) => <TalentCard key={t.id} t={t} showCity={false} />)}
              </div>
            </CollapsibleCityGroup>
          ))}
        </div>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {filtered.map((t) => <TalentCard key={t.id} t={t} showCity={!groupByCity} />)}
        </div>
      )}
    </>
  );
}
