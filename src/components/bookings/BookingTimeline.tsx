import type { AtelierEvent } from '@/lib/types/database';
import { PALETTE } from '@/lib/utils/constants';
import { formatDateTime } from '@/lib/utils/format';

type Props = { events: AtelierEvent[] };

const EVENT_LABELS: Record<string, string> = {
  'booking.created': 'Booking created',
  'booking.state_changed': 'State changed',
  'booking.updated': 'Booking updated',
  'approval.approved': 'Approval granted',
  'approval.rejected': 'Approval rejected',
};

export default function BookingTimeline({ events }: Props) {
  return (
    <section className="rounded-lg border p-4" style={{ background: PALETTE.surface, borderColor: PALETTE.border }}>
      <h3 className="mb-3 text-xs font-semibold uppercase tracking-wide" style={{ color: PALETTE.muted }}>
        Timeline
      </h3>
      {events.length === 0 ? (
        <p className="text-xs" style={{ color: PALETTE.muted }}>No events yet.</p>
      ) : (
        <div className="space-y-3">
          {events.map((e) => {
            const payload = (e.payload ?? {}) as Record<string, unknown>;
            return (
              <div key={e.id} className="border-l-2 pl-3" style={{ borderColor: PALETTE.border }}>
                <div className="text-xs font-medium" style={{ color: PALETTE.text }}>
                  {EVENT_LABELS[e.event_type] ?? e.event_type}
                </div>
                {payload.from && payload.to ? (
                  <div className="text-[11px]" style={{ color: PALETTE.muted }}>
                    {String(payload.from)} → {String(payload.to)}
                  </div>
                ) : null}
                {payload.reason ? (
                  <div className="text-[11px]" style={{ color: PALETTE.muted }}>
                    {String(payload.reason)}
                  </div>
                ) : null}
                <div className="text-[10px]" style={{ color: '#6b7186' }}>
                  {formatDateTime(e.created_at)}
                  {e.actor && ` · ${e.actor}`}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </section>
  );
}
