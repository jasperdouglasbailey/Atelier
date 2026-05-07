'use client';

import { useState } from 'react';
import Link from 'next/link';
import type { AtelierEvent } from '@/lib/types/database';
import { PALETTE } from '@/lib/utils/constants';
import { formatDateTime } from '@/lib/utils/format';
import { describeEvent } from '@/lib/utils/event-descriptions';

type Props = { events: AtelierEvent[] };

const EVENT_DOT_COLORS: Record<string, string> = {
  'booking.created':         PALETTE.accent,
  'booking.state_changed':   PALETTE.success,
  'booking.updated':         PALETTE.muted,
  'approval.approved':       PALETTE.success,
  'approval.rejected':       PALETTE.danger,
  'crew.status_change':      PALETTE.warning,
  'crew.hold_request_sent':  PALETTE.accent,
  'crew_holds.proposed':     PALETTE.warning,
};

/**
 * Audit timeline for the right rail of the booking detail page.
 *
 * Why collapsible: most days Jasper doesn't need to see "every audit row
 * since the booking was created" — it's noise on the page. The data
 * underneath is mandatory (compliance, debugging) but the panel is not.
 *
 * Why explicit ordering: the page passes events in `created_at DESC`
 * (newest first) by default. We re-sort here defensively so the displayed
 * order is always honest — newest-first, with a stable secondary sort on
 * id to make ties deterministic. This fixes the bug where a freshly-created
 * v1 quote (written during booking insert) could appear ABOVE the brief-
 * parsed event that happened later, because their timestamps were close
 * enough for the ORDER BY to flip them.
 */
export default function CollapsibleTimeline({ events }: Props) {
  const [open, setOpen] = useState(false);

  // Defensive re-sort: newest first, ties broken by id for stability.
  const sorted = [...events].sort((a, b) => {
    const tDiff = new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
    if (tDiff !== 0) return tDiff;
    return a.id.localeCompare(b.id);
  });

  const eventCount = sorted.length;

  return (
    <section className="rounded-lg border" style={{ background: PALETTE.surface, borderColor: PALETTE.border }}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="w-full flex items-center justify-between px-4 py-3 text-left"
        aria-expanded={open}
      >
        <div className="flex items-center gap-2">
          <span className="text-[10px] font-semibold uppercase tracking-wider" style={{ color: PALETTE.muted }}>
            {open ? '▾' : '▸'} Timeline
          </span>
          <span className="text-[10px]" style={{ color: PALETTE.muted }}>
            ({eventCount} {eventCount === 1 ? 'event' : 'events'})
          </span>
        </div>
        <span className="text-[10px]" style={{ color: PALETTE.muted }}>
          {open ? 'Hide' : 'Show'}
        </span>
      </button>
      {open && (
        <div className="px-4 pb-4">
          {sorted.length === 0 ? (
            <p className="text-xs" style={{ color: PALETTE.muted }}>No events yet.</p>
          ) : (
            <div className="space-y-0">
              {sorted.map((e, idx) => {
                const payload = (e.payload ?? {}) as Record<string, unknown>;
                const { label, detail } = describeEvent(e.event_type, payload);
                const dotColor = EVENT_DOT_COLORS[e.event_type] ?? PALETTE.border;
                const isLast = idx === sorted.length - 1;

                return (
                  <div key={e.id} className="flex gap-3">
                    <div className="flex flex-col items-center">
                      <div
                        className="mt-1 h-2 w-2 flex-none rounded-full"
                        style={{ background: dotColor }}
                      />
                      {!isLast && (
                        <div className="w-px flex-1 my-1" style={{ background: PALETTE.border }} />
                      )}
                    </div>
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
                      <div className="text-[10px] mt-0.5" style={{ color: PALETTE.muted, opacity: 0.7 }}>
                        {formatDateTime(e.created_at)}
                        {e.actor ? ` · ${e.actor}` : ''}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {sorted.length > 0 && (
            <Link
              href="/audit"
              className="mt-2 block text-[10px] underline-offset-2 hover:underline"
              style={{ color: PALETTE.muted }}
            >
              Full audit log →
            </Link>
          )}
        </div>
      )}
    </section>
  );
}
