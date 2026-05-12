import { notFound } from 'next/navigation';
import Link from 'next/link';
import Topbar from '@/components/layout/Topbar';
import { getCrewMember } from '@/lib/data/entities';
import { listCrewBookings } from '@/lib/data/crew-bookings';
import SendOnboardingLinkButton from '@/components/onboarding/SendOnboardingLinkButton';
import DeleteEntityButton from '@/components/entities/DeleteEntityButton';
import DataRightsControls from '@/components/entities/DataRightsControls';
import { PALETTE, CREW_TIER_LABELS, CREW_STATUS_LABELS, BOOKING_STATE_LABELS, STATE_COLORS } from '@/lib/utils/constants';
import { formatDate, formatCurrency } from '@/lib/utils/format';
import { humanise } from '@/lib/utils/humanise';
import type { BookingState } from '@/lib/types/database';

type Props = { params: Promise<{ id: string }> };

function Stat({ label, value, sublabel }: { label: string; value: React.ReactNode; sublabel?: string }) {
  return (
    <div className="rounded-md border px-3 py-2" style={{ borderColor: PALETTE.border, background: PALETTE.bg }}>
      <div className="text-[10px] font-semibold uppercase tracking-wider" style={{ color: PALETTE.muted }}>{label}</div>
      <div className="mt-0.5 text-base font-semibold" style={{ color: PALETTE.text }}>{value}</div>
      {sublabel && <div className="mt-0.5 text-[10px]" style={{ color: PALETTE.muted }}>{sublabel}</div>}
    </div>
  );
}

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

  // Quick stats from crew booking history
  const totalBookings = bookingRows.length;
  const confirmedBookings = bookingRows.filter((b) => b.status === 'confirmed').length;
  const activeBookings = bookingRows.filter(
    (b) => !['paid', 'released', 'cancelled'].includes(b.booking_state),
  ).length;
  const ratesPaid = bookingRows
    .filter((b) => b.status === 'confirmed' && b.day_rate)
    .map((b) => b.day_rate as number);
  const avgDayRate = ratesPaid.length > 0
    ? Math.round(ratesPaid.reduce((s, r) => s + r, 0) / ratesPaid.length)
    : null;
  const topRole = (() => {
    if (totalBookings === 0) return null;
    const counts: Record<string, number> = {};
    for (const b of bookingRows) {
      const r = b.role_on_booking;
      if (r) counts[r] = (counts[r] ?? 0) + 1;
    }
    return Object.entries(counts).sort((a, b) => b[1] - a[1])[0]?.[0] ?? null;
  })();

  // Format all roles as "Digital Operator / Assistant" style
  const allRoles = [
    crew.primary_role ? humanise(crew.primary_role) : null,
    ...(crew.secondary_roles ?? []).map(humanise),
  ].filter(Boolean).join(' / ');

  return (
    <>
      <Topbar title={crew.name} />
      <div className="p-4 sm:p-6 max-w-6xl space-y-4">
        <Link href="/crew" className="text-xs" style={{ color: PALETTE.accent }}>← Crew</Link>

        {/* Header — three tidy rows: identity / status badges / actions */}
        <section className="rounded-lg border p-4 space-y-3" style={{ background: PALETTE.surface, borderColor: PALETTE.border }}>
          {/* Row 1 — identity */}
          <div>
            <h2 className="text-lg font-semibold" style={{ color: PALETTE.text }}>{crew.name}</h2>
            {allRoles && (
              <div className="text-xs mt-0.5" style={{ color: PALETTE.accent }}>{allRoles}</div>
            )}
          </div>

          {/* Row 2 — status badges */}
          <div className="flex flex-wrap gap-2 pt-2 border-t" style={{ borderColor: PALETTE.border }}>
            <span className="rounded-full px-2 py-0.5 text-[10px] font-semibold" style={{ background: `${tierColor}22`, color: tierColor }}>
              {CREW_TIER_LABELS[crew.tier]}
            </span>
            <span className="rounded-full px-2 py-0.5 text-[10px] font-semibold" style={{
              background: crew.is_active ? `${PALETTE.success}22` : `${PALETTE.danger}22`,
              color: crew.is_active ? PALETTE.success : PALETTE.danger,
            }}>
              {crew.is_active ? 'Active' : 'Inactive'}
            </span>
            <span className="rounded-full px-2 py-0.5 text-[10px] font-semibold" style={{
              background: crew.gst_registered ? `${PALETTE.success}22` : `${PALETTE.muted}22`,
              color: crew.gst_registered ? PALETTE.success : PALETTE.muted,
            }}>
              {crew.gst_registered ? 'GST Reg' : 'No GST'}
            </span>
            <span className="rounded-full px-2 py-0.5 text-[10px] font-semibold" style={{
              background: crew.onboarding_completed ? `${PALETTE.success}22` : `${PALETTE.warning}22`,
              color: crew.onboarding_completed ? PALETTE.success : PALETTE.warning,
            }}>
              {crew.onboarding_completed ? 'Onboarded' : 'Onboarding pending'}
            </span>
          </div>

          {/* Row 3 — actions. Send onboarding link hidden once completed. */}
          <div className="flex flex-wrap gap-2 pt-2 border-t" style={{ borderColor: PALETTE.border }}>
            <Link
              href={`/crew/${crew.id}/edit`}
              className="rounded px-3 py-1 text-xs font-medium"
              style={{ background: PALETTE.surface, color: PALETTE.muted, border: `1px solid ${PALETTE.border}` }}
            >
              ✏ Edit
            </Link>
            {crew.drive_folder_link && (
              <a
                href={crew.drive_folder_link}
                target="_blank"
                rel="noreferrer"
                className="rounded px-3 py-1 text-xs font-medium"
                style={{ background: `${PALETTE.accent}18`, color: PALETTE.accent, border: `1px solid ${PALETTE.accent}44` }}
              >
                Drive ↗
              </a>
            )}
            {!crew.onboarding_completed && (
              <SendOnboardingLinkButton type="crew" entityId={crew.id} hasEmail={Boolean(crew.email)} />
            )}
            <DeleteEntityButton type="crew" id={crew.id} name={crew.name} size="sm" />
          </div>
        </section>

        {/* Two-column grid — all the detail sections sit side-by-side so the
            page fits on one screen without scrolling on a laptop. */}
        <div className="grid gap-4 md:grid-cols-2">

          {/* LEFT column */}
          <div className="space-y-4">

            {/* Contact */}
            <section className="rounded-lg border p-4" style={{ background: PALETTE.surface, borderColor: PALETTE.border }}>
              <h3 className="mb-3 text-xs font-semibold uppercase tracking-wide" style={{ color: PALETTE.muted }}>Contact</h3>
              <div className="grid gap-3 grid-cols-2">
                <Field label="Email" value={crew.email} />
                <Field label="Mobile" value={crew.mobile} />
                <Field label="City / Home Base" value={crew.city} />
                <Field label="Date of Birth" value={crew.dob ? formatDate(crew.dob) : null} />
                {crew.home_address && (
                  <div className="col-span-2">
                    <Field label="Home Address" value={crew.home_address} />
                  </div>
                )}
              </div>
            </section>

            {/* Business */}
            <section className="rounded-lg border p-4" style={{ background: PALETTE.surface, borderColor: PALETTE.border }}>
              <h3 className="mb-3 text-xs font-semibold uppercase tracking-wide" style={{ color: PALETTE.muted }}>Business</h3>
              <div className="grid gap-3 grid-cols-2">
                <Field label="ABN" value={crew.abn} />
                <Field label="GST Registered" value={crew.gst_registered ? 'Yes' : 'No'} />
                <Field
                  label="Day Rate"
                  value={
                    crew.default_day_rate != null
                      ? crew.min_day_rate || crew.max_day_rate
                        ? `${formatCurrency(crew.default_day_rate)} (${formatCurrency(crew.min_day_rate ?? crew.default_day_rate)}–${formatCurrency(crew.max_day_rate ?? crew.default_day_rate)})`
                        : formatCurrency(crew.default_day_rate)
                      : null
                  }
                />
                <Field label="Xero Contact" value={crew.xero_contact_id ? 'Linked' : 'Not linked'} />
                <Field label="Bank in Xero" value={crew.bank_setup_in_xero ? 'Yes' : 'No'} />
              </div>
            </section>

            {/* Call sheet preferences */}
            {(crew.dietary || crew.drink_order) && (
              <section className="rounded-lg border p-4" style={{ background: PALETTE.surface, borderColor: PALETTE.border }}>
                <h3 className="mb-3 text-xs font-semibold uppercase tracking-wide" style={{ color: PALETTE.muted }}>Call Sheet</h3>
                <div className="grid gap-3 grid-cols-2">
                  <Field label="Dietary" value={crew.dietary} />
                  <Field label="Drink Order" value={crew.drink_order} />
                </div>
              </section>
            )}

          </div>{/* /LEFT */}

          {/* RIGHT column */}
          <div className="space-y-4">

            {/* Bank Account */}
            {(crew.bank_account_name || crew.bank_bsb || crew.bank_account_number) && (
              <section className="rounded-lg border p-4" style={{ background: PALETTE.surface, borderColor: PALETTE.border }}>
                <h3 className="mb-3 text-xs font-semibold uppercase tracking-wide" style={{ color: PALETTE.muted }}>Bank Account</h3>
                <div className="grid gap-3 grid-cols-1">
                  <Field label="Account Name" value={crew.bank_account_name} />
                  <Field label="BSB" value={crew.bank_bsb} />
                  <Field label="Account Number" value={crew.bank_account_number} />
                </div>
              </section>
            )}

            {/* Super */}
            <section className="rounded-lg border p-4" style={{ background: PALETTE.surface, borderColor: PALETTE.border }}>
              <h3 className="mb-3 text-xs font-semibold uppercase tracking-wide" style={{ color: PALETTE.muted }}>Superannuation</h3>
              <div className="grid gap-3 grid-cols-2">
                <div className="col-span-2">
                  <Field label="Fund Name" value={crew.super_fund_name} />
                </div>
                <Field label="Member Number" value={crew.super_member_number} />
                <Field label="USI" value={crew.super_usi} />
              </div>
            </section>

            {/* Kit & Certs */}
            <section className="rounded-lg border p-4" style={{ background: PALETTE.surface, borderColor: PALETTE.border }}>
              <h3 className="mb-3 text-xs font-semibold uppercase tracking-wide" style={{ color: PALETTE.muted }}>Equipment & Certifications</h3>
              <div className="space-y-3">
                <Field label="Kit List" value={crew.kit_list} />
                <Field label="Certifications" value={crew.certifications?.join(', ')} />
              </div>
            </section>

            {/* Notes */}
            {crew.notes && (
              <section className="rounded-lg border p-4" style={{ background: PALETTE.surface, borderColor: PALETTE.border }}>
                <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide" style={{ color: PALETTE.muted }}>Notes</h3>
                <p className="whitespace-pre-wrap text-sm" style={{ color: PALETTE.text }}>{crew.notes}</p>
              </section>
            )}

          </div>{/* /RIGHT */}

        </div>{/* /grid */}

        {/* Booking history — full width */}
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
                      {b.role_on_booking && <span>{humanise(b.role_on_booking)}</span>}
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

        <DataRightsControls type="crew" id={crew.id} name={crew.name} />

        {/* Stats */}
        {totalBookings > 0 && (
          <section className="rounded-lg border p-4" style={{ background: PALETTE.surface, borderColor: PALETTE.border }}>
            <h3 className="mb-3 text-xs font-semibold uppercase tracking-wide" style={{ color: PALETTE.muted }}>Stats</h3>
            <div className="grid gap-2 grid-cols-2 sm:grid-cols-4">
              <Stat label="Bookings" value={totalBookings} sublabel={`${confirmedBookings} confirmed`} />
              <Stat label="Active" value={activeBookings} sublabel="not yet paid" />
              <Stat
                label="Avg Day Rate"
                value={avgDayRate ? formatCurrency(avgDayRate, 'AUD') : '—'}
                sublabel={ratesPaid.length > 0 ? `over ${ratesPaid.length} confirmed` : undefined}
              />
              <Stat
                label="Top Role"
                value={topRole ? humanise(topRole) : '—'}
                sublabel={topRole ? 'most assigned' : undefined}
              />
            </div>
          </section>
        )}

        <div className="text-[10px] pt-2" style={{ color: PALETTE.muted }}>
          Created {formatDate(crew.created_at)} · Updated {formatDate(crew.updated_at)}
        </div>
      </div>
    </>
  );
}
