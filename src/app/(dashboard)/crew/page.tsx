import Link from 'next/link';
import Topbar from '@/components/layout/Topbar';
import ListSearchBar from '@/components/layout/ListSearchBar';
import { listCrew, listCrewCities } from '@/lib/data/entities';
import { PALETTE, CREW_TIER_LABELS } from '@/lib/utils/constants';
import { humanise } from '@/lib/utils/humanise';
import type { CrewTier, Crew } from '@/lib/types/database';
import CreateCrewDialog from '@/components/entities/CreateCrewDialog';
import CSVImportExport from '@/components/csv/CSVImportExport';
import CollapsibleCityGroup from '@/components/entities/CollapsibleCityGroup';
import { orderCityKeys, NO_CITY_KEY } from '@/lib/utils/city-order';

type SearchParams = Promise<{ search?: string; tier?: string; city?: string; group?: string }>;

export default async function CrewPage({ searchParams }: { searchParams: SearchParams }) {
  const params = await searchParams;
  const groupByCity = params.group !== 'flat';

  const [crew, cities] = await Promise.all([
    listCrew({
      search: params.search,
      tier: params.tier as CrewTier | undefined,
      city: params.city || undefined,
    }),
    listCrewCities(),
  ]);

  const tierColor = (tier: string) => {
    if (tier === 'preferred_core') return PALETTE.success;
    if (tier === 'never_again') return PALETTE.danger;
    return PALETTE.muted;
  };

  // Group crew by city when grouping is on (default). Crew with no city land in a "No city set" bucket.
  const grouped: Record<string, Crew[]> = {};
  if (groupByCity) {
    for (const c of crew) {
      const key = c.city ?? NO_CITY_KEY;
      (grouped[key] ??= []).push(c);
    }
  }

  // City order: anchors first (Sydney → Melbourne → Byron/Gold Coast →
  // Adelaide), then by frequency, alphabetical to break ties, NO_CITY last.
  const groupKeys = orderCityKeys(
    Object.keys(grouped).map((k) => ({ key: k, count: grouped[k].length })),
  );

  function CrewCard({ c }: { c: Crew }) {
    return (
      <Link key={c.id} href={`/crew/${c.id}`} className="block rounded-lg border p-4 transition hover:border-opacity-80" style={{ background: PALETTE.surface, borderColor: PALETTE.border }}>
        <div className="flex items-start justify-between gap-2">
          <div className="text-sm font-medium" style={{ color: PALETTE.text }}>{c.name}</div>
          <span className="rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase shrink-0" style={{ background: `${tierColor(c.tier)}22`, color: tierColor(c.tier) }}>
            {CREW_TIER_LABELS[c.tier]}
          </span>
        </div>
        {c.primary_role && (
          <div className="mt-1 text-xs" style={{ color: PALETTE.accent }}>
            {[c.primary_role, ...(c.secondary_roles ?? [])].map(humanise).join(' / ')}
          </div>
        )}
        <div className="mt-2 space-y-0.5 text-xs" style={{ color: PALETTE.muted }}>
          {c.city && !groupByCity && <div>{c.city}</div>}
          {c.email && <div className="truncate">{c.email}</div>}
          {c.mobile && <div>{c.mobile}</div>}
          {c.default_day_rate && <div>Day rate: ${c.default_day_rate}</div>}
        </div>
        <div className="mt-2 flex flex-wrap gap-1.5 text-[10px]">
          {c.gst_registered && <span className="rounded-full border px-2 py-0.5" style={{ borderColor: PALETTE.border, color: PALETTE.muted }}>GST</span>}
          {!c.onboarding_completed && <span className="rounded-full border px-2 py-0.5" style={{ borderColor: PALETTE.warning, color: PALETTE.warning }}>Onboarding pending</span>}
          {c.dietary && c.dietary.toUpperCase() !== 'NIL' && c.dietary.toUpperCase() !== 'NIL DIET' && (
            <span className="rounded-full border px-2 py-0.5" style={{ borderColor: PALETTE.border, color: PALETTE.muted }}>Dietary: {c.dietary}</span>
          )}
        </div>
      </Link>
    );
  }

  return (
    <>
      <Topbar title="Crew" />
      <div className="p-4 sm:p-6">
        <ListSearchBar
          searchValue={params.search}
          searchPlaceholder="Search by name or role…"
          hiddenParams={{
            ...(params.tier ? { tier: params.tier } : {}),
            ...(params.city ? { city: params.city } : {}),
            ...(params.group ? { group: params.group } : {}),
          }}
          filters={
            <>
              <select
                name="city"
                defaultValue={params.city ?? ''}
                className="rounded-md border bg-transparent px-3 py-2 text-sm"
                style={{ borderColor: PALETTE.border, color: PALETTE.text, background: PALETTE.bg }}
              >
                <option value="">All cities</option>
                {cities.map((c) => <option key={c} value={c}>{c}</option>)}
              </select>
              <select
                name="tier"
                defaultValue={params.tier ?? ''}
                className="rounded-md border bg-transparent px-3 py-2 text-sm"
                style={{ borderColor: PALETTE.border, color: PALETTE.text, background: PALETTE.bg }}
              >
                <option value="">All tiers</option>
                {Object.entries(CREW_TIER_LABELS).map(([k, v]) => (
                  <option key={k} value={k}>{v}</option>
                ))}
              </select>
            </>
          }
          count={crew.length}
          countLabel="crew member"
          rightSlot={
            <div className="flex items-center gap-2">
              <CSVImportExport type="crew" />
              <CreateCrewDialog />
            </div>
          }
        />

        {/* Group / flat toggle */}
        {!params.city && cities.length > 0 && (
          <div className="mb-4 flex items-center gap-1 text-[11px]" style={{ color: PALETTE.muted }}>
            <span>View:</span>
            <Link
              href={{ pathname: '/crew', query: { ...(params.search ? { search: params.search } : {}), ...(params.tier ? { tier: params.tier } : {}) } }}
              className="rounded px-2 py-0.5"
              style={{
                background: groupByCity ? `${PALETTE.accent}22` : 'transparent',
                color: groupByCity ? PALETTE.accent : PALETTE.muted,
              }}
            >
              Grouped by city
            </Link>
            <Link
              href={{ pathname: '/crew', query: { group: 'flat', ...(params.search ? { search: params.search } : {}), ...(params.tier ? { tier: params.tier } : {}) } }}
              className="rounded px-2 py-0.5"
              style={{
                background: !groupByCity ? `${PALETTE.accent}22` : 'transparent',
                color: !groupByCity ? PALETTE.accent : PALETTE.muted,
              }}
            >
              Flat list
            </Link>
          </div>
        )}

        {crew.length === 0 ? (
          <div className="py-12 text-center text-sm" style={{ color: PALETTE.muted }}>
            {params.search || params.tier || params.city
              ? 'No crew match these filters.'
              : 'No crew yet. Add your first crew member to get started.'}
          </div>
        ) : groupByCity && !params.city ? (
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
                  {grouped[key].map((c) => <CrewCard key={c.id} c={c} />)}
                </div>
              </CollapsibleCityGroup>
            ))}
          </div>
        ) : (
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {crew.map((c) => <CrewCard key={c.id} c={c} />)}
          </div>
        )}
      </div>
    </>
  );
}
