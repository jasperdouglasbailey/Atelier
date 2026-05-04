import Link from 'next/link';
import Topbar from '@/components/layout/Topbar';
import ListSearchBar from '@/components/layout/ListSearchBar';
import { listTalent } from '@/lib/data/entities';
import { PALETTE, ARTIST_DISCIPLINE_LABELS } from '@/lib/utils/constants';
import type { ArtistDiscipline } from '@/lib/types/database';
import CreateTalentDialog from '@/components/entities/CreateTalentDialog';

type SearchParams = Promise<{ search?: string; discipline?: string }>;

export default async function TalentPage({ searchParams }: { searchParams: SearchParams }) {
  const params = await searchParams;
  const allTalent = await listTalent(params.search);
  // Discipline filter applies in-memory (small dataset; no need to push to DB).
  const talent = params.discipline
    ? allTalent.filter((t) => t.discipline === params.discipline)
    : allTalent;

  return (
    <>
      <Topbar title="Talent" />
      <div className="p-4 sm:p-6">
        <ListSearchBar
          searchValue={params.search}
          searchPlaceholder="Search by name or specialty…"
          hiddenParams={params.discipline ? { discipline: params.discipline } : undefined}
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
          rightSlot={<CreateTalentDialog />}
        />

        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {talent.map((t) => (
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
          ))}
          {talent.length === 0 && (
            <div className="col-span-full py-12 text-center text-sm" style={{ color: PALETTE.muted }}>
              {params.search || params.discipline
                ? 'No talent match these filters.'
                : 'No talent yet. Add your first artist to get started.'}
            </div>
          )}
        </div>
      </div>
    </>
  );
}
