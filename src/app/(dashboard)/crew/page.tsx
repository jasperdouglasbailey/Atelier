import Link from 'next/link';
import Topbar from '@/components/layout/Topbar';
import ListSearchBar from '@/components/layout/ListSearchBar';
import { listCrew } from '@/lib/data/entities';
import { PALETTE, CREW_TIER_LABELS } from '@/lib/utils/constants';
import type { CrewTier } from '@/lib/types/database';
import CreateCrewDialog from '@/components/entities/CreateCrewDialog';
import CSVImportExport from '@/components/csv/CSVImportExport';

type SearchParams = Promise<{ search?: string; tier?: string }>;

export default async function CrewPage({ searchParams }: { searchParams: SearchParams }) {
  const params = await searchParams;
  const crew = await listCrew({
    search: params.search,
    tier: params.tier as CrewTier | undefined,
  });

  const tierColor = (tier: string) => {
    if (tier === 'preferred_core') return PALETTE.success;
    if (tier === 'never_again') return PALETTE.danger;
    return PALETTE.muted;
  };

  return (
    <>
      <Topbar title="Crew" />
      <div className="p-4 sm:p-6">
        <ListSearchBar
          searchValue={params.search}
          searchPlaceholder="Search by name or role…"
          hiddenParams={params.tier ? { tier: params.tier } : undefined}
          filters={
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

        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {crew.map((c) => (
            <Link key={c.id} href={`/crew/${c.id}`} className="block rounded-lg border p-4 transition hover:border-opacity-80" style={{ background: PALETTE.surface, borderColor: PALETTE.border }}>
              <div className="flex items-start justify-between">
                <div className="text-sm font-medium" style={{ color: PALETTE.text }}>{c.name}</div>
                <span className="rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase" style={{ background: `${tierColor(c.tier)}22`, color: tierColor(c.tier) }}>
                  {CREW_TIER_LABELS[c.tier]}
                </span>
              </div>
              {c.primary_role && <div className="mt-1 text-xs capitalize" style={{ color: PALETTE.accent }}>{c.primary_role.replace(/_/g, ' ')}</div>}
              <div className="mt-2 space-y-0.5 text-xs" style={{ color: PALETTE.muted }}>
                {c.email && <div>{c.email}</div>}
                {c.mobile && <div>{c.mobile}</div>}
                {c.default_day_rate && <div>Day rate: ${c.default_day_rate}</div>}
              </div>
              <div className="mt-2 flex gap-2 text-[10px]">
                {c.gst_registered && <span className="rounded-full border px-2 py-0.5" style={{ borderColor: PALETTE.border, color: PALETTE.muted }}>GST</span>}
                {!c.onboarding_completed && <span className="rounded-full border px-2 py-0.5" style={{ borderColor: PALETTE.warning, color: PALETTE.warning }}>Onboarding pending</span>}
              </div>
            </Link>
          ))}
          {crew.length === 0 && (
            <div className="col-span-full py-12 text-center text-sm" style={{ color: PALETTE.muted }}>
              {params.search || params.tier
                ? 'No crew match these filters.'
                : 'No crew yet. Add your first crew member to get started.'}
            </div>
          )}
        </div>
      </div>
    </>
  );
}
