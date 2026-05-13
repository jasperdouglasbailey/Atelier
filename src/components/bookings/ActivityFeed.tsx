import type { AtelierEvent } from '@/lib/types/database';
import { PALETTE } from '@/lib/utils/constants';
import { describeEvent } from '@/lib/utils/event-descriptions';

type Props = { events: AtelierEvent[] };

export default function ActivityFeed({ events }: Props) {
  const recent = [...events]
    .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
    .slice(0, 6);

  return (
    <div style={{ padding: '1rem' }}>
      <div
        style={{
          fontFamily: 'var(--font-dm-mono), monospace',
          fontSize: 9,
          fontWeight: 500,
          letterSpacing: '0.12em',
          textTransform: 'uppercase',
          color: PALETTE.muted,
          marginBottom: '0.75rem',
        }}
      >
        Activity
      </div>

      {recent.length === 0 ? (
        <p style={{ fontSize: 11, color: PALETTE.muted }}>No activity yet.</p>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {recent.map((ev) => {
            const desc = describeEvent(
              ev.event_type,
              (ev.payload as Record<string, unknown>) ?? {},
            );
            const dt = new Date(ev.created_at);
            const dateStr = dt.toLocaleDateString('en-AU', { day: 'numeric', month: 'short' });
            const timeStr = dt.toLocaleTimeString('en-AU', { hour: '2-digit', minute: '2-digit', hour12: false });
            return (
              <div key={ev.id} style={{ display: 'flex', gap: 8, alignItems: 'flex-start' }}>
                <div
                  style={{
                    width: 5,
                    height: 5,
                    borderRadius: '50%',
                    background: PALETTE.accent,
                    flexShrink: 0,
                    marginTop: 5,
                  }}
                />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 11, color: PALETTE.text, lineHeight: 1.4 }}>
                    {desc.label}
                  </div>
                  {desc.detail && (
                    <div
                      style={{
                        fontSize: 10,
                        color: PALETTE.muted,
                        marginTop: 1,
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        whiteSpace: 'nowrap',
                      }}
                    >
                      {desc.detail}
                    </div>
                  )}
                  <div
                    style={{
                      fontFamily: 'var(--font-dm-mono), monospace',
                      fontSize: 9,
                      color: PALETTE.muted,
                      marginTop: 2,
                      letterSpacing: '0.04em',
                    }}
                  >
                    {dateStr} · {timeStr}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
