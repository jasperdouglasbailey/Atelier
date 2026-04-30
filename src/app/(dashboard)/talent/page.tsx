import Link from 'next/link';
import Topbar from '@/components/layout/Topbar';
import { listTalent } from '@/lib/data/entities';
import { PALETTE } from '@/lib/utils/constants';
import CreateTalentDialog from '@/components/entities/CreateTalentDialog';

export default async function TalentPage() {
  const talent = await listTalent();

  return (
    <>
      <Topbar title="Talent" />
      <div className="p-4 sm:p-6">
        <div className="mb-4 flex items-center justify-between">
          <p className="text-xs" style={{ color: PALETTE.muted }}>{talent.length} artist{talent.length === 1 ? '' : 's'}</p>
          <CreateTalentDialog />
        </div>

        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {talent.map((t) => (
            <Link key={t.id} href={`/talent/${t.id}`} className="block rounded-lg border p-4 transition hover:border-opacity-80" style={{ background: PALETTE.surface, borderColor: PALETTE.border }}>
              <div className="flex items-start justify-between">
                <div>
                  <div className="text-sm font-medium" style={{ color: PALETTE.text }}>{t.working_name}</div>
                  {t.legal_name !== t.working_name && (
                    <div className="text-[11px]" style={{ color: PALETTE.muted }}>{t.legal_name}</div>
                  )}
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
              No talent yet. Add your first artist to get started.
            </div>
          )}
        </div>
      </div>
    </>
  );
}
