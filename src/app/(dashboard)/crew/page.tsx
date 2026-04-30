import Topbar from '@/components/layout/Topbar';
import { listCrew } from '@/lib/data/entities';
import { PALETTE, CREW_TIER_LABELS } from '@/lib/utils/constants';
import CreateCrewDialog from '@/components/entities/CreateCrewDialog';

export default async function CrewPage() {
  const crew = await listCrew();

  const tierColor = (tier: string) => {
    if (tier === 'preferred_core') return PALETTE.success;
    if (tier === 'never_again') return PALETTE.danger;
    return PALETTE.muted;
  };

  return (
    <>
      <Topbar title="Crew" />
      <div className="p-4 sm:p-6">
        <div className="mb-4 flex items-center justify-between">
          <p className="text-xs" style={{ color: PALETTE.muted }}>{crew.length} crew member{crew.length === 1 ? '' : 's'}</p>
          <CreateCrewDialog />
        </div>

        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {crew.map((c) => (
            <div key={c.id} className="rounded-lg border p-4" style={{ background: PALETTE.surface, borderColor: PALETTE.border }}>
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
            </div>
          ))}
          {crew.length === 0 && (
            <div className="col-span-full py-12 text-center text-sm" style={{ color: PALETTE.muted }}>
              No crew yet. Add your first crew member to get started.
            </div>
          )}
        </div>
      </div>
    </>
  );
}
