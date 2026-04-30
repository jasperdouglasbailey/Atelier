import { notFound } from 'next/navigation';
import Link from 'next/link';
import Topbar from '@/components/layout/Topbar';
import { getCrewMember } from '@/lib/data/entities';
import { PALETTE, CREW_TIER_LABELS } from '@/lib/utils/constants';
import { formatDate, formatCurrency } from '@/lib/utils/format';

type Props = { params: Promise<{ id: string }> };

function Field({ label, value }: { label: string; value: React.ReactNode }) {
  if (value == null || value === '') return null;
  return (
    <div>
      <div className="text-[10px] font-semibold uppercase tracking-wider" style={{ color: PALETTE.muted }}>{label}</div>
      <div className="mt-0.5 text-sm" style={{ color: PALETTE.text }}>{value}</div>
    </div>
  );
}

const TIER_COLORS: Record<string, string> = {
  preferred_core: PALETTE.success,
  regular_freelance: PALETTE.accent,
  never_again: PALETTE.danger,
};

export default async function CrewDetailPage({ params }: Props) {
  const { id } = await params;
  const crew = await getCrewMember(id);
  if (!crew) notFound();

  const tierColor = TIER_COLORS[crew.tier] ?? PALETTE.muted;

  return (
    <>
      <Topbar title={crew.name} />
      <div className="p-4 sm:p-6 max-w-3xl space-y-4">
        <Link href="/crew" className="text-xs" style={{ color: PALETTE.accent }}>← Crew</Link>

        {/* Header */}
        <section className="rounded-lg border p-4" style={{ background: PALETTE.surface, borderColor: PALETTE.border }}>
          <div className="flex items-start justify-between">
            <div>
              <h2 className="text-lg font-semibold" style={{ color: PALETTE.text }}>{crew.name}</h2>
              <div className="text-xs mt-0.5" style={{ color: PALETTE.muted }}>
                {crew.primary_role?.replace(/_/g, ' ')}
                {crew.secondary_roles?.length ? ` · ${crew.secondary_roles.map(r => r.replace(/_/g, ' ')).join(', ')}` : ''}
              </div>
            </div>
            <div className="flex gap-2">
              <span className="rounded-full px-2 py-0.5 text-[10px] font-semibold" style={{ background: `${tierColor}22`, color: tierColor }}>
                {CREW_TIER_LABELS[crew.tier]}
              </span>
              <span className="rounded-full px-2 py-0.5 text-[10px] font-semibold" style={{
                background: crew.is_active ? `${PALETTE.success}22` : `${PALETTE.danger}22`,
                color: crew.is_active ? PALETTE.success : PALETTE.danger,
              }}>
                {crew.is_active ? 'Active' : 'Inactive'}
              </span>
            </div>
          </div>
        </section>

        {/* Contact + Business */}
        <section className="rounded-lg border p-4" style={{ background: PALETTE.surface, borderColor: PALETTE.border }}>
          <h3 className="mb-3 text-xs font-semibold uppercase tracking-wide" style={{ color: PALETTE.muted }}>Contact & Business</h3>
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Email" value={crew.email} />
            <Field label="Mobile" value={crew.mobile} />
            <Field label="ABN" value={crew.abn} />
            <Field label="GST Registered" value={crew.gst_registered ? 'Yes' : 'No'} />
            <Field label="Default Day Rate" value={crew.default_day_rate != null ? formatCurrency(crew.default_day_rate) : null} />
            <Field label="Xero Contact" value={crew.xero_contact_id ? 'Linked' : 'Not linked'} />
            <Field label="Bank in Xero" value={crew.bank_setup_in_xero ? 'Yes' : 'No'} />
          </div>
        </section>

        {/* Super */}
        <section className="rounded-lg border p-4" style={{ background: PALETTE.surface, borderColor: PALETTE.border }}>
          <h3 className="mb-3 text-xs font-semibold uppercase tracking-wide" style={{ color: PALETTE.muted }}>Superannuation</h3>
          <div className="grid gap-3 sm:grid-cols-3">
            <Field label="Fund Name" value={crew.super_fund_name} />
            <Field label="Member Number" value={crew.super_member_number} />
            <Field label="USI" value={crew.super_usi} />
          </div>
        </section>

        {/* Kit & Certs */}
        <section className="rounded-lg border p-4" style={{ background: PALETTE.surface, borderColor: PALETTE.border }}>
          <h3 className="mb-3 text-xs font-semibold uppercase tracking-wide" style={{ color: PALETTE.muted }}>Equipment & Certifications</h3>
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Kit List" value={crew.kit_list} />
            <Field label="Certifications" value={crew.certifications?.join(', ')} />
          </div>
        </section>

        {crew.notes && (
          <section className="rounded-lg border p-4" style={{ background: PALETTE.surface, borderColor: PALETTE.border }}>
            <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide" style={{ color: PALETTE.muted }}>Notes</h3>
            <p className="whitespace-pre-wrap text-sm" style={{ color: PALETTE.text }}>{crew.notes}</p>
          </section>
        )}

        <div className="text-[10px] pt-2" style={{ color: PALETTE.muted }}>
          Created {formatDate(crew.created_at)} · Updated {formatDate(crew.updated_at)}
          {' · '}Onboarding: {crew.onboarding_completed ? 'Complete' : 'Pending'}
        </div>
      </div>
    </>
  );
}
