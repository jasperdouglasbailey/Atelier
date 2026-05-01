import { notFound } from 'next/navigation';
import Link from 'next/link';
import Topbar from '@/components/layout/Topbar';
import { getCrewMember } from '@/lib/data/entities';
import { listCrewBookings } from '@/lib/data/crew-bookings';
import { PALETTE, CREW_TIER_LABELS, CREW_STATUS_LABELS, BOOKING_STATE_LABELS, STATE_COLORS } from '@/lib/utils/constants';
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

const TIER_COLORS: Record<string, string> = {
  preferred_core: PALETTE.success,
  regular_freelance: PALETTE.accent,
  never_again: PALETTE.danger,
};

export default async function CrewDetailPage({ params }: Props) {
  const { id } = await params;
  const [crew, bookingRows] = await Promise.all([
    getCrewMember(id),
    listCrewBookings(id),
  ]);
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

        {/* Booking history */}
        <section className="rounded-lg border p-4" style={{ background: PALETTE.surface, borderColor: PALETTE.border }}>
          <h3 className="mb-3 text-xs font-semibold uppercase tracking-wide" style={{ color: PALETTE.muted }}>
            Booking History ({bookingRows.length})
          </h3>
          {bookingRows.length === 0 ? (
            <p className="text-xs" style={{ color: PALETTE.muted }}>Not assigned to any bookings yet.</p>
          ) : (
            <div className="space-y-1.5">
              {bookingRows.map((b) => (
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
                      {b.role_on_booking && <span>{b.role_on_booking.replace(/_/g, ' ')}</span>}
                      {b.day_rate != null && <span>{formatCurrency(b.day_rate)}/day</span>}
                      {b.shoot_date_notes && <span>{b.shoot_date_notes}</span>}
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
                        background: b.status === 'confirmed' ? `${PALETTE.success}22`
                          : b.status === 'declined' ? `${PALETTE.danger}22`
                          : `${PALETTE.warning}22`,
                        color: b.status === 'confirmed' ? PALETTE.success
                          : b.status === 'declined' ? PALETTE.danger
                          : PALETTE.warning,
                      }}
                    >
                      {CREW_STATUS_LABELS[b.status as keyof typeof CREW_STATUS_LABELS] ?? b.status}
                    </span>
                  </div>
                </Link>
              ))}
            </div>
          )}
        </section>

        <div className="text-[10px] pt-2" style={{ color: PALETTE.muted }}>
          Created {formatDate(crew.created_at)} · Updated {formatDate(crew.updated_at)}
          {' · '}Onboarding: {crew.onboarding_completed ? 'Complete' : 'Pending'}
        </div>
      </div>
    </>
  );
}
