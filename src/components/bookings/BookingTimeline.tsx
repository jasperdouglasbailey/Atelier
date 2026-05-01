import Link from 'next/link';
import type { AtelierEvent } from '@/lib/types/database';
import { PALETTE } from '@/lib/utils/constants';
import { formatDateTime } from '@/lib/utils/format';
import { describeEvent } from '@/lib/utils/event-descriptions';

type Props = { events: AtelierEvent[] };

const EVENT_DOT_COLORS: Record<string, string> = {
  'booking.created': PALETTE.accent,
  'booking.state_changed': PALETTE.success,
  'booking.updated': PALETTE.muted,
  'approval.approved': PALETTE.success,
  'approval.rejected': PALETTE.danger,
  'crew.status_change': PALETTE.warning,
  'crew.hold_request_sent': PALETTE.accent,
  'crew_holds.proposed': PALETTE.warning,
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
        <div className="space-y-0">
          {events.map((e, idx) => {
            const payload = (e.payload ?? {}) as Record<string, unknown>;
            const { label, detail } = describeEvent(e.event_type, payload);
            const dotColor = EVENT_DOT_COLORS[e.event_type] ?? PALETTE.border;
            const isLast = idx === events.length - 1;

            return (
              <div key={e.id} className="flex gap-3">
                {/* Dot + line */}
                <div className="flex flex-col items-center">
                  <div
                    className="mt-1 h-2 w-2 flex-none rounded-full"
                    style={{ background: dotColor }}
                  />
                  {!isLast && (
                    <div className="w-px flex-1 my-1" style={{ background: PALETTE.border }} />
                  )}
                </div>

                {/* Content */}
                <div className="pb-3 min-w-0">
                  <div className="text-xs font-medium leading-snug" style={{ color: PALETTE.text }}>
                    {label}
                  </div>
                  {detail && (
                    <div className="text-[11px] mt-0.5" style={{ color: PALETTE.muted }}>{detail}</div>
                  )}
                  {payload.reason ? (
                    <div className="text-[11px] mt-0.5 italic" style={{ color: PALETTE.muted }}>
                      {String(payload.reason)}
                    </div>
                  ) : null}
                  <div className="text-[10px] mt-0.5" style={{ color: '#6b6b6b' }}>
                    {formatDateTime(e.created_at)}
                    {e.actor ? ` · ${e.actor}` : ''}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {events.length > 0 && (
        <Link
          href="/audit"
          className="mt-2 block text-[10px] underline-offset-2 hover:underline"
          style={{ color: PALETTE.muted }}
        >
          Full audit log →
        </Link>
      )}
    </section>
  );
}
