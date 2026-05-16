import Link from 'next/link';
import { PALETTE } from '@/lib/utils/constants';
import type { MonthShootMarker } from '@/lib/data/dashboard';

/**
 * Compact month grid for the dashboard. 7 columns (Mon..Sun), 5-6 rows.
 * Each cell shows the day number; days with shoots get:
 *   - 1 shoot:  short booking ref (last numeric chunk) below the day
 *   - 2+ shoots: small "×N" count badge instead
 * Colour: green for confirmed (locked-in) days, amber if any booking is
 * still pre-confirmed.
 *
 * The whole panel links through to /bookings?view=calendar for full
 * detail — the calendar is a glance, not a deep read.
 */

const DAY_LABELS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

/**
 * Extract the most-identifiable suffix from a booking ref.
 * "BOOK-0042" → "0042"
 * "AJE-OB-7"  → "7"
 * Falls back to the whole string if no recognisable suffix.
 */
function shortRef(ref: string | null): string {
  if (!ref) return '·';
  const m = ref.match(/[A-Z0-9]+$/);
  return m ? m[0] : ref;
}

export default function MiniMonthCalendar({
  year,
  month,             // 0-indexed
  shootMarkers,
  today = new Date(),
  className,
}: {
  year: number;
  month: number;
  shootMarkers: Map<string, MonthShootMarker[]>;
  today?: Date;
  className?: string;
}) {
  // First day of the month, normalised to Monday-start grid.
  const first = new Date(year, month, 1);
  const dow = first.getDay(); // 0=Sun
  const leadingBlanks = (dow + 6) % 7; // Mon=0
  const daysInMonth = new Date(year, month + 1, 0).getDate();

  const cells: Array<{ day: number | null; iso: string | null }> = [];
  for (let i = 0; i < leadingBlanks; i++) cells.push({ day: null, iso: null });
  for (let d = 1; d <= daysInMonth; d++) {
    const iso = `${year}-${String(month + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
    cells.push({ day: d, iso });
  }
  // Pad to multiple of 7
  while (cells.length % 7 !== 0) cells.push({ day: null, iso: null });

  const monthName = new Date(year, month, 1).toLocaleDateString('en-AU', { month: 'long', year: 'numeric' });
  const todayISO = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;

  return (
    <Link
      href="/bookings?view=calendar"
      className={`block rounded-lg border p-4 transition hover:opacity-90 ${className ?? ''}`}
      style={{ background: PALETTE.surface, borderColor: PALETTE.border }}
    >
      <div className="mb-2 flex items-baseline justify-between">
        <h2 className="text-[11px] font-semibold uppercase tracking-wider" style={{ color: PALETTE.muted }}>
          {monthName}
        </h2>
        <span className="text-[10px]" style={{ color: PALETTE.accent }}>Open calendar →</span>
      </div>

      <div className="grid grid-cols-7 gap-y-1 text-center">
        {DAY_LABELS.map((d) => (
          <div key={d} className="text-[9px] font-medium pb-0.5" style={{ color: PALETTE.muted }}>{d}</div>
        ))}
        {cells.map((c, i) => {
          if (c.day === null) {
            return <div key={`b-${i}`} className="h-10" />;
          }
          const markers = c.iso ? shootMarkers.get(c.iso) ?? [] : [];
          const hasShoot = markers.length > 0;
          const allConfirmed = hasShoot && markers.every((m) => m.isConfirmed);
          const isToday = c.iso === todayISO;
          const indicatorColor = !hasShoot ? null
            : allConfirmed ? PALETTE.success
            : PALETTE.warning;

          return (
            <div
              key={c.iso}
              className="relative flex h-10 flex-col items-center justify-start rounded text-[11px] px-0.5 pt-0.5"
              style={{
                color: isToday ? PALETTE.bg : PALETTE.text,
                background: isToday ? PALETTE.accent : 'transparent',
                fontWeight: isToday ? 600 : 400,
              }}
              title={hasShoot
                ? markers.map((m) => `${m.bookingRef ?? m.title}${m.isConfirmed ? '' : ' (held)'}`).join('\n')
                : undefined}
            >
              <span className="tabular-nums leading-none">{c.day}</span>
              {hasShoot && markers.length === 1 && indicatorColor && (
                <span
                  className="mt-1 inline-block rounded px-1 text-[8px] font-semibold tabular-nums leading-tight"
                  style={{
                    color: isToday ? PALETTE.bg : indicatorColor,
                    background: isToday ? 'rgba(255,255,255,0.18)' : `${indicatorColor}22`,
                    maxWidth: '100%',
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    whiteSpace: 'nowrap',
                  }}
                >
                  {shortRef(markers[0].bookingRef)}
                </span>
              )}
              {hasShoot && markers.length > 1 && indicatorColor && (
                <span
                  className="mt-1 inline-block rounded px-1 text-[8px] font-semibold tabular-nums leading-tight"
                  style={{
                    color: isToday ? PALETTE.bg : indicatorColor,
                    background: isToday ? 'rgba(255,255,255,0.18)' : `${indicatorColor}22`,
                  }}
                >
                  ×{markers.length}
                </span>
              )}
            </div>
          );
        })}
      </div>

      <div className="mt-3 flex items-center gap-3 text-[10px] flex-wrap" style={{ color: PALETTE.muted }}>
        <span className="inline-flex items-center gap-1">
          <span className="inline-block h-1.5 w-1.5 rounded-full" style={{ background: PALETTE.success }} /> Confirmed
        </span>
        <span className="inline-flex items-center gap-1">
          <span className="inline-block h-1.5 w-1.5 rounded-full" style={{ background: PALETTE.warning }} /> Held
        </span>
        <span>·</span>
        <span>{shootMarkers.size} shoot day{shootMarkers.size === 1 ? '' : 's'} this month</span>
      </div>
    </Link>
  );
}
