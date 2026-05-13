import type { BookingDetailRow } from '@/lib/data/bookings';
import type { BookingSchedule } from '@/lib/types/database';
import { PALETTE } from '@/lib/utils/constants';
import { formatDate } from '@/lib/utils/format';
import { dateRangeToInputs } from '@/lib/utils/daterange';
import { humanise } from '@/lib/utils/humanise';

type Props = {
  booking: BookingDetailRow;
  schedules: BookingSchedule[];
};

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="border-b py-3 last:border-b-0" style={{ borderColor: PALETTE.border }}>
      <div className="text-[9px] font-semibold uppercase tracking-widest mb-1" style={{ color: PALETTE.muted }}>
        {label}
      </div>
      <div className="text-sm" style={{ color: PALETTE.text }}>
        {children}
      </div>
    </div>
  );
}

export default function BookingJobFacts({ booking, schedules }: Props) {
  const { start, end } = dateRangeToInputs(booking.shoot_dates);
  const dateStr = start
    ? end && end !== start
      ? `${formatDate(start)} – ${formatDate(end)}`
      : formatDate(start)
    : booking.shoot_date_notes ?? null;

  const hasCallTimes = schedules.some((s) => s.call_time || s.wrap_time);

  const hasBrief = !!(
    booking.brief_raw_text ||
    booking.shoot_location ||
    booking.deliverables_type ||
    dateStr
  );

  if (!hasBrief) return null;

  return (
    <div
      className="rounded-lg border divide-y-0"
      style={{ background: PALETTE.surface, borderColor: PALETTE.border }}
    >
      <div className="px-4 py-3 border-b" style={{ borderColor: PALETTE.border }}>
        <span className="text-[9px] font-semibold uppercase tracking-widest" style={{ color: PALETTE.muted }}>
          Job facts
        </span>
      </div>

      <div className="px-4">
        {booking.brief_raw_text && (
          <Row label="Brief">
            <span className="line-clamp-3 text-sm leading-relaxed" style={{ color: PALETTE.muted }}>
              &ldquo;{booking.brief_raw_text.slice(0, 220)}{booking.brief_raw_text.length > 220 ? '…' : ''}&rdquo;
            </span>
          </Row>
        )}

        {dateStr && (
          <Row label="Dates">
            {dateStr}
            {booking.shoot_date_notes && !start && (
              <div className="mt-0.5 text-[11px]" style={{ color: PALETTE.muted }}>
                {booking.shoot_date_notes}
              </div>
            )}
          </Row>
        )}

        {booking.shoot_location && (
          <Row label="Location">
            {booking.shoot_location}
          </Row>
        )}

        {hasCallTimes ? (
          <Row label="Call times">
            <div className="space-y-1">
              {schedules
                .filter((s) => s.call_time || s.wrap_time)
                .slice(0, 3)
                .map((s) => (
                  <div key={s.id} className="text-[11px]" style={{ color: PALETTE.muted }}>
                    <span className="font-medium" style={{ color: PALETTE.text }}>
                      {formatDate(s.schedule_date)}
                    </span>
                    {s.call_time && <> · Call {s.call_time}</>}
                    {s.wrap_time && <> · Wrap {s.wrap_time}</>}
                    {s.location && <> · {s.location}</>}
                  </div>
                ))}
            </div>
          </Row>
        ) : booking.call_time ? (
          <Row label="Call time">
            {booking.call_time}
          </Row>
        ) : null}

        {(booking.deliverables_type || booking.deliverables_count) && (
          <Row label="Deliverables">
            <div className="flex flex-wrap gap-1.5">
              {booking.deliverables_type && (
                <span
                  className="rounded-full px-2 py-0.5 text-[10px] font-medium"
                  style={{ background: PALETTE.border, color: PALETTE.text }}
                >
                  {humanise(booking.deliverables_type)}
                </span>
              )}
              {booking.deliverables_count != null && (
                <span
                  className="rounded-full px-2 py-0.5 text-[10px] font-medium"
                  style={{ background: PALETTE.border, color: PALETTE.text }}
                >
                  {booking.deliverables_count} deliverables
                </span>
              )}
              {booking.post_production_ownership && (
                <span
                  className="rounded-full px-2 py-0.5 text-[10px]"
                  style={{ background: PALETTE.border, color: PALETTE.muted }}
                >
                  {humanise(booking.post_production_ownership)}
                </span>
              )}
            </div>
          </Row>
        )}
      </div>
    </div>
  );
}
