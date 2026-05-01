import { notFound } from 'next/navigation';
import Link from 'next/link';
import Topbar from '@/components/layout/Topbar';
import { getTalent } from '@/lib/data/entities';
import { listTalentBookingHistory } from '@/lib/data/quotes';
import { PALETTE, BOOKING_STATE_LABELS, STATE_COLORS, ARTIST_DISCIPLINE_LABELS, PREFERRED_COMMS_LABELS } from '@/lib/utils/constants';
import type { ArtistDiscipline, PreferredComms } from '@/lib/types/database';
import ArchiveTalentButton from '@/components/entities/ArchiveTalentButton';
import { formatDate, formatCurrency } from '@/lib/utils/format';
import type { BookingState } from '@/lib/types/database';

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
  const [talent, bookingHistory] = await Promise.all([
    getTalent(id),
    listTalentBookingHistory(id),
  ]);
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
              <div className="text-xs mt-0.5" style={{ color: PALETTE.muted }}>
                {ARTIST_DISCIPLINE_LABELS[talent.discipline as ArtistDiscipline] ?? talent.discipline}
                {talent.specialty ? ` · ${talent.specialty}` : ''}
                {' · '}{talent.legal_name}
              </div>
              {talent.preferred_comms && (
                <div className="text-[10px] mt-0.5" style={{ color: PALETTE.muted }}>
                  Prefers: {PREFERRED_COMMS_LABELS[talent.preferred_comms as PreferredComms] ?? talent.preferred_comms}
                </div>
              )}
            </div>
            <div className="flex items-center gap-2">
              <Badge label={talent.is_active ? 'Active' : 'Inactive'} active={talent.is_active} />
              <Badge label={talent.gst_registered ? 'GST Reg' : 'No GST'} active={talent.gst_registered} />
              <Badge label={talent.onboarding_completed ? 'Onboarded' : 'Pending'} active={talent.onboarding_completed} />
              <Link
                href={`/talent/${talent.id}/edit`}
                className="rounded px-3 py-1 text-xs font-medium"
                style={{ background: PALETTE.surface, color: PALETTE.muted, border: `1px solid ${PALETTE.border}` }}
              >
                ✏ Edit
              </Link>
              <ArchiveTalentButton talentId={talent.id} currentlyActive={talent.is_active} />
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

        {/* Booking history */}
        <section className="rounded-lg border p-4" style={{ background: PALETTE.surface, borderColor: PALETTE.border }}>
          <h3 className="mb-3 text-xs font-semibold uppercase tracking-wide" style={{ color: PALETTE.muted }}>
            Booking History ({bookingHistory.length})
          </h3>
          {bookingHistory.length === 0 ? (
            <p className="text-xs" style={{ color: PALETTE.muted }}>Not assigned to any bookings yet.</p>
          ) : (
            <div className="space-y-1.5">
              {bookingHistory.map((b) => (
                <Link
                  key={b.id}
                  href={`/bookings/${b.booking_id}`}
                  className="flex items-center justify-between rounded border px-3 py-2 transition hover:border-opacity-80"
                  style={{ borderColor: PALETTE.border }}
                >
                  <div>
                    <div className="text-xs font-medium" style={{ color: PALETTE.text }}>
                      {b.booking_ref ?? b.booking_title}
                    </div>
                    <div className="flex gap-2 text-[10px]" style={{ color: PALETTE.muted }}>
                      {b.role_on_booking && <span>{b.role_on_booking}</span>}
                      {b.day_rate != null && <span>{formatCurrency(b.day_rate)}/day</span>}
                      {b.usage_fee != null && b.usage_fee > 0 && <span>+{formatCurrency(b.usage_fee)} usage</span>}
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <span
                      className="rounded-full px-1.5 py-0.5 text-[9px] font-semibold"
                      style={{
                        background: `${STATE_COLORS[b.booking_state as BookingState] ?? PALETTE.muted}22`,
                        color: STATE_COLORS[b.booking_state as BookingState] ?? PALETTE.muted,
                      }}
                    >
                      {BOOKING_STATE_LABELS[b.booking_state as BookingState] ?? b.booking_state}
                    </span>
                    <span
                      className="rounded-full px-1.5 py-0.5 text-[9px] font-semibold"
                      style={{
                        background: b.confirmed ? `${PALETTE.success}22` : `${PALETTE.warning}22`,
                        color: b.confirmed ? PALETTE.success : PALETTE.warning,
                      }}
                    >
                      {b.confirmed ? 'Confirmed' : 'Pencilled'}
                    </span>
                  </div>
                </Link>
              ))}
            </div>
          )}
        </section>

        <div className="text-[10px] pt-2" style={{ color: PALETTE.muted }}>
          Created {formatDate(talent.created_at)} · Updated {formatDate(talent.updated_at)}
        </div>
      </div>
    </>
  );
}
