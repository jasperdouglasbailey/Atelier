import Link from 'next/link';
import Topbar from '@/components/layout/Topbar';
import ListSearchBar from '@/components/layout/ListSearchBar';
import { listTalent } from '@/lib/data/entities';
import { PALETTE, ARTIST_DISCIPLINE_LABELS } from '@/lib/utils/constants';
import type { ArtistDiscipline, Talent } from '@/lib/types/database';
import CreateTalentDialog from '@/components/entities/CreateTalentDialog';
import CSVImportExport from '@/components/csv/CSVImportExport';
import CollapsibleCityGroup from '@/components/entities/CollapsibleCityGroup';
import { orderCityKeys, NO_CITY_KEY } from '@/lib/utils/city-order';

type SearchParams = Promise<{ search?: string; discipline?: string; group?: string }>;

export default async function TalentPage({ searchParams }: { searchParams: SearchParams }) {
  const params = await searchParams;
  const groupByCity = params.group !== 'flat';
  const allTalent = await listTalent(params.search);
  // Discipline filter applies in-memory (small dataset; no need to push to DB).
  const talent = params.discipline
    ? allTalent.filter((t) => t.discipline === params.discipline)
    : allTalent;

  // Group by city for the default view, mirroring the crew list pattern.
  const grouped: Record<string, Talent[]> = {};
  if (groupByCity) {
    for (const t of talent) {
      const key = t.city ?? NO_CITY_KEY;
      (grouped[key] ??= []).push(t);
    }
  }
  const groupKeys = orderCityKeys(
    Object.keys(grouped).map((k) => ({ key: k, count: grouped[k].length })),
  );
  const hasAnyCity = talent.some((t) => Boolean(t.city));

  function TalentCard({ t }: { t: Talent }) {
    return (
      <Link key={t.id} href={`/talent/${t.id}`} className="block rounded-lg border p-4 transition hover:border-opacity-80" style={{ background: PALETTE.surface, borderColor: PALETTE.border }}>
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
          {t.city && !groupByCity && <div>{t.city}</div>}
          {t.email && <div>{t.email}</div>}
          {t.mobile && <div>{t.mobile}</div>}
          {t.instagram && <div>@{t.instagram}</div>}
        </div>
        <div className="mt-2 flex gap-2 text-[10px]">
          {t.gst_registered && <span className="rounded-full border px-2 py-0.5" style={{ borderColor: PALETTE.border, color: PALETTE.muted }}>GST</span>}
          {t.representation_status === 'exclusive' && <span className="rounded-full border px-2 py-0.5" style={{ borderColor: PALETTE.accent, color: PALETTE.accent }}>Exclusive</span>}
          {!t.onboarding_completed && <span className="rounded-full border px-2 py-0.5" style={{ borderColor: PALETTE.warning, color: PALETTE.warning }}>Onboarding pending</span>}
        </div>
      </Link>
    );
  }

  return (
    <>
      <Topbar title="Talent" />
      <div className="p-4 sm:p-6">
        <ListSearchBar
          searchValue={params.search}
          searchPlaceholder="Search by name or specialty…"
          hiddenParams={{
            ...(params.discipline ? { discipline: params.discipline } : {}),
            ...(params.group ? { group: params.group } : {}),
          }}
          filters={
            <select
              name="discipline"
              defaultValue={params.discipline ?? ''}
              className="rounded-md border bg-transparent px-3 py-2 text-sm"
              style={{ borderColor: PALETTE.border, color: PALETTE.text, background: PALETTE.bg }}
            >
              <option value="">All disciplines</option>
              {Object.entries(ARTIST_DISCIPLINE_LABELS).map(([k, v]) => (
                <option key={k} value={k}>{v}</option>
              ))}
            </select>
          }
          count={talent.length}
          countLabel="artist"
          rightSlot={
            <div className="flex items-center gap-2">
              <CSVImportExport type="talent" />
              <CreateTalentDialog />
            </div>
          }
        />

        {/* Group / flat toggle — only meaningful when at least one talent has a city set. */}
        {hasAnyCity && (
          <div className="mb-4 flex items-center gap-1 text-[11px]" style={{ color: PALETTE.muted }}>
            <span>View:</span>
            <Link
              href={{ pathname: '/talent', query: { ...(params.search ? { search: params.search } : {}), ...(params.discipline ? { discipline: params.discipline } : {}) } }}
              className="rounded px-2 py-0.5"
              style={{
                background: groupByCity ? `${PALETTE.accent}22` : 'transparent',
                color: groupByCity ? PALETTE.accent : PALETTE.muted,
              }}
            >
              Grouped by city
            </Link>
            <Link
              href={{ pathname: '/talent', query: { group: 'flat', ...(params.search ? { search: params.search } : {}), ...(params.discipline ? { discipline: params.discipline } : {}) } }}
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

        {talent.length === 0 ? (
          <div className="py-12 text-center text-sm" style={{ color: PALETTE.muted }}>
            {params.search || params.discipline
              ? 'No talent match these filters.'
              : 'No talent yet. Add your first artist to get started.'}
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
                  {grouped[key].map((t) => <TalentCard key={t.id} t={t} />)}
                </div>
              </CollapsibleCityGroup>
            ))}
          </div>
        ) : (
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {talent.map((t) => <TalentCard key={t.id} t={t} />)}
          </div>
        )}
      </div>
    </>
  );
}
