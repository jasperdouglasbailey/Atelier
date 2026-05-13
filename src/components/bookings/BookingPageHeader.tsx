import Link from 'next/link';
import type { BookingDetailRow } from '@/lib/data/bookings';
import type { BookingTalent } from '@/lib/types/database';
import StageStepper from '@/components/bookings/StageStepper';
import { PALETTE, BOOKING_STATE_LABELS } from '@/lib/utils/constants';
import { formatCurrency, formatDate } from '@/lib/utils/format';
import { dateRangeToInputs } from '@/lib/utils/daterange';

type Props = {
  booking: BookingDetailRow;
  primaryTalent: (BookingTalent & { talent?: { working_name?: string; name?: string } | null }) | null;
};

export default function BookingPageHeader({ booking, primaryTalent }: Props) {
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
    { label: 'Client',      value: clientName ?? '—' },
    { label: 'Talent',      value: talentName ?? '—' },
    { label: 'Shoot date',  value: dateStr },
    { label: 'Budget',      value: booking.grand_total > 0 ? formatCurrency(booking.grand_total, 'AUD') : '—' },
    { label: 'Status',      value: BOOKING_STATE_LABELS[booking.state] },
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

        {/* Title row */}
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0">
            <h1
              className="text-3xl font-normal leading-tight truncate"
              style={{
                color: PALETTE.text,
                fontFamily: 'Georgia, "Times New Roman", serif',
                letterSpacing: '-0.01em',
              }}
            >
              {booking.title}
            </h1>
            <div className="mt-1 text-xs font-medium" style={{ color: PALETTE.muted, letterSpacing: '0.06em' }}>
              JOB / {booking.booking_ref ?? '—'}
            </div>
          </div>
        </div>

        {/* Stage pill bar */}
        <div className="mt-4">
          <StageStepper state={booking.state} />
        </div>

        {/* Metadata strip */}
        <div
          className="mt-4 grid border-t"
          style={{
            borderColor: PALETTE.border,
            gridTemplateColumns: `repeat(${meta.length}, 1fr)`,
          }}
        >
          {meta.map(({ label, value }) => (
            <div
              key={label}
              className="py-3 pr-4 border-r last:border-r-0"
              style={{ borderColor: PALETTE.border }}
            >
              <div className="text-[9px] font-semibold uppercase tracking-widest mb-0.5" style={{ color: PALETTE.muted }}>
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
