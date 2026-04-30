import { notFound } from 'next/navigation';
import Link from 'next/link';
import Topbar from '@/components/layout/Topbar';
import { getTalent } from '@/lib/data/entities';
import { PALETTE } from '@/lib/utils/constants';
import { formatDate } from '@/lib/utils/format';

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

function Badge({ label, active }: { label: string; active: boolean }) {
  return (
    <span
      className="rounded-full px-2 py-0.5 text-[10px] font-semibold"
      style={{
        background: active ? `${PALETTE.success}22` : `${PALETTE.danger}22`,
        color: active ? PALETTE.success : PALETTE.danger,
      }}
    >
      {label}
    </span>
  );
}

export default async function TalentDetailPage({ params }: Props) {
  const { id } = await params;
  const talent = await getTalent(id);
  if (!talent) notFound();

  return (
    <>
      <Topbar title={talent.working_name} />
      <div className="p-4 sm:p-6 max-w-3xl space-y-4">
        <div className="flex flex-wrap items-center gap-2 mb-2">
          <Link href="/talent" className="text-xs" style={{ color: PALETTE.accent }}>← Talent</Link>
        </div>

        {/* Header */}
        <section className="rounded-lg border p-4" style={{ background: PALETTE.surface, borderColor: PALETTE.border }}>
          <div className="flex items-start justify-between">
            <div>
              <h2 className="text-lg font-semibold" style={{ color: PALETTE.text }}>{talent.working_name}</h2>
              <div className="text-xs mt-0.5" style={{ color: PALETTE.muted }}>{talent.legal_name}</div>
            </div>
            <div className="flex gap-2">
              <Badge label={talent.is_active ? 'Active' : 'Inactive'} active={talent.is_active} />
              <Badge label={talent.gst_registered ? 'GST Reg' : 'No GST'} active={talent.gst_registered} />
              <Badge label={talent.onboarding_completed ? 'Onboarded' : 'Pending'} active={talent.onboarding_completed} />
            </div>
          </div>
        </section>

        {/* Contact */}
        <section className="rounded-lg border p-4" style={{ background: PALETTE.surface, borderColor: PALETTE.border }}>
          <h3 className="mb-3 text-xs font-semibold uppercase tracking-wide" style={{ color: PALETTE.muted }}>Contact</h3>
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Email" value={talent.email} />
            <Field label="Mobile" value={talent.mobile} />
            <Field label="Pronouns" value={talent.pronouns} />
            <Field label="Date of Birth" value={talent.dob ? formatDate(talent.dob) : null} />
            <Field label="Instagram" value={talent.instagram} />
            <Field label="Website" value={talent.website} />
          </div>
        </section>

        {/* Business */}
        <section className="rounded-lg border p-4" style={{ background: PALETTE.surface, borderColor: PALETTE.border }}>
          <h3 className="mb-3 text-xs font-semibold uppercase tracking-wide" style={{ color: PALETTE.muted }}>Business</h3>
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="ABN" value={talent.abn} />
            <Field label="Entity Type" value={talent.entity_type} />
            <Field label="Representation" value={talent.representation_status} />
            <Field label="Work Rights" value={talent.work_rights} />
            <Field label="Visa Expiry" value={talent.visa_expiry ? formatDate(talent.visa_expiry) : null} />
            <Field label="Xero Contact" value={talent.xero_contact_id ? 'Linked' : 'Not linked'} />
            <Field label="Bank in Xero" value={talent.bank_setup_in_xero ? 'Yes' : 'No'} />
          </div>
        </section>

        {/* Super */}
        <section className="rounded-lg border p-4" style={{ background: PALETTE.surface, borderColor: PALETTE.border }}>
          <h3 className="mb-3 text-xs font-semibold uppercase tracking-wide" style={{ color: PALETTE.muted }}>Superannuation</h3>
          <div className="grid gap-3 sm:grid-cols-3">
            <Field label="Fund Name" value={talent.super_fund_name} />
            <Field label="Member Number" value={talent.super_member_number} />
            <Field label="USI" value={talent.super_usi} />
          </div>
        </section>

        {/* Emergency Contact */}
        {(talent.emergency_name || talent.emergency_mobile) && (
          <section className="rounded-lg border p-4" style={{ background: PALETTE.surface, borderColor: PALETTE.border }}>
            <h3 className="mb-3 text-xs font-semibold uppercase tracking-wide" style={{ color: PALETTE.muted }}>Emergency Contact</h3>
            <div className="grid gap-3 sm:grid-cols-3">
              <Field label="Name" value={talent.emergency_name} />
              <Field label="Relationship" value={talent.emergency_relationship} />
              <Field label="Mobile" value={talent.emergency_mobile} />
            </div>
          </section>
        )}

        {/* Documents */}
        <section className="rounded-lg border p-4" style={{ background: PALETTE.surface, borderColor: PALETTE.border }}>
          <h3 className="mb-3 text-xs font-semibold uppercase tracking-wide" style={{ color: PALETTE.muted }}>Documents & Compliance</h3>
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Passport Expiry" value={talent.passport_expiry ? formatDate(talent.passport_expiry) : null} />
            <Field label="Drivers Licence Expiry" value={talent.drivers_licence_expiry ? formatDate(talent.drivers_licence_expiry) : null} />
            <Field label="WWCC Number" value={talent.wwcc_number} />
            <Field label="WWCC Expiry" value={talent.wwcc_expiry ? formatDate(talent.wwcc_expiry) : null} />
          </div>
        </section>

        {talent.notes && (
          <section className="rounded-lg border p-4" style={{ background: PALETTE.surface, borderColor: PALETTE.border }}>
            <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide" style={{ color: PALETTE.muted }}>Notes</h3>
            <p className="whitespace-pre-wrap text-sm" style={{ color: PALETTE.text }}>{talent.notes}</p>
          </section>
        )}

        <div className="text-[10px] pt-2" style={{ color: PALETTE.muted }}>
          Created {formatDate(talent.created_at)} · Updated {formatDate(talent.updated_at)}
        </div>
      </div>
    </>
  );
}
