import Link from 'next/link';
import type { BookingDetailRow } from '@/lib/data/bookings';
import type { BookingTalent } from '@/lib/types/database';
import type { BookingRoster } from '@/lib/data/booking-roster';
import StageStepper from '@/components/bookings/StageStepper';
import BookingAdvanceButtons from '@/components/bookings/BookingAdvanceButtons';
import BookingLifecycleControls from '@/components/bookings/BookingLifecycleControls';
import CopyTeamButton from '@/components/bookings/CopyTeamButton';
import { PALETTE, BOOKING_STATE_LABELS } from '@/lib/utils/constants';
import { formatCurrency, formatDate } from '@/lib/utils/format';
import { dateRangeToInputs } from '@/lib/utils/daterange';

type Props = {
  booking: BookingDetailRow;
  primaryTalent: (BookingTalent & { talent?: { working_name?: string; name?: string } | null }) | null;
  roster: BookingRoster | null;
};

export default function BookingPageHeader({ booking, primaryTalent, roster }: Props) {
  const clientName = booking.client?.company || booking.client?.name || null;
  const talentName = (primaryTalent?.talent as { working_name?: string; name?: string } | null)?.working_name
    ?? (primaryTalent?.talent as { working_name?: string; name?: string } | null)?.name
    ?? null;

  const { start, end } = dateRangeToInputs(booking.shoot_dates);
  const dateStr = start
    ? end && end !== start
      ? `${formatDate(start)} – ${formatDate(end)}`
      : formatDate(start)
    : booking.shoot_date_notes ?? '—';

  const meta: { label: string; value: string }[] = [
    { label: 'Client',     value: clientName ?? '—' },
    { label: 'Talent',     value: talentName ?? '—' },
    { label: 'Shoot date', value: dateStr },
    { label: 'Budget',     value: booking.grand_total > 0 ? formatCurrency(booking.grand_total, 'AUD') : '—' },
    { label: 'Status',     value: BOOKING_STATE_LABELS[booking.state] },
  ];

  return (
    <div className="border-b" style={{ borderColor: PALETTE.border }}>
      <div className="px-6 pt-5 pb-0">
        {/* Breadcrumb */}
        <nav className="mb-3 flex items-center gap-1.5 text-[10px] font-medium uppercase tracking-widest" style={{ color: PALETTE.muted }}>
          <Link href="/bookings" className="hover:underline" style={{ color: PALETTE.muted }}>
            Bookings
          </Link>
          <span>›</span>
          {clientName && (
            <>
              <Link
                href={booking.client?.id ? `/clients/${booking.client.id}` : '#'}
                className="hover:underline"
                style={{ color: PALETTE.muted }}
              >
                {clientName}
              </Link>
              <span>›</span>
            </>
          )}
          <span style={{ color: PALETTE.text }}>{booking.title}</span>
        </nav>

        {/* Title row + action bar */}
        <div className="flex items-start justify-between gap-6 flex-wrap">
          <div className="min-w-0 flex-1">
            <h1
              className="text-3xl font-normal leading-tight truncate"
              style={{
                color: PALETTE.text,
                fontFamily: 'var(--font-fraunces), Georgia, serif',
                letterSpacing: '-0.01em',
              }}
            >
              {booking.title}
            </h1>
            <div
              className="mt-1"
              style={{
                fontFamily: 'var(--font-dm-mono), monospace',
                fontSize: 10,
                fontWeight: 500,
                letterSpacing: '0.12em',
                textTransform: 'uppercase',
                color: PALETTE.muted,
              }}
            >
              JOB / {booking.booking_ref ?? '—'}
            </div>
          </div>

          {/* Right-side actions: Advance → Copy team → Archive */}
          <div className="flex items-center gap-3 flex-shrink-0 flex-wrap">
            <BookingAdvanceButtons bookingId={booking.id} bookingState={booking.state} />
            <div className="h-5 w-px" style={{ background: PALETTE.border }} />
            <CopyTeamButton
              roster={roster}
              bookingRef={booking.booking_ref}
              bookingTitle={booking.title}
            />
            <BookingLifecycleControls
              bookingId={booking.id}
              bookingRef={booking.booking_ref}
              bookingState={booking.state}
              isArchived={(booking as { is_archived?: boolean }).is_archived ?? false}
              compact
            />
          </div>
        </div>

        {/* Stage pill bar */}
        <div className="mt-4">
          <StageStepper state={booking.state} />
        </div>

        {/* Metadata strip — generous padding so text doesn't crowd the dividers */}
        <div
          className="mt-5 grid border-t"
          style={{
            borderColor: PALETTE.border,
            gridTemplateColumns: `repeat(${meta.length}, 1fr)`,
          }}
        >
          {meta.map(({ label, value }, i) => (
            <div
              key={label}
              className="py-4 px-5 border-r last:border-r-0"
              style={{ borderColor: PALETTE.border, paddingLeft: i === 0 ? 0 : undefined }}
            >
              <div
                style={{
                  fontFamily: 'var(--font-dm-mono), monospace',
                  fontSize: 9,
                  fontWeight: 500,
                  letterSpacing: '0.16em',
                  textTransform: 'uppercase',
                  color: PALETTE.muted,
                  marginBottom: 4,
                }}
              >
                {label}
              </div>
              <div className="text-sm font-medium truncate" style={{ color: PALETTE.text }}>
                {value}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
