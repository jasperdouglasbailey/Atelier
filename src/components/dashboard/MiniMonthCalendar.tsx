import Link from 'next/link';
import { PALETTE } from '@/lib/utils/constants';

/**
 * Compact month grid for the dashboard. 7 columns (Mon..Sun), 5-6 rows.
 * Each cell shows the day number; cells with shoots get a sand-coloured
 * dot. The whole panel links through to /bookings?view=calendar.
 *
 * Design choice: dots only, no per-shoot text. The user asked for a
 * "quick glance" — full bookings list is one click away.
 */

const DAY_LABELS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

export default function MiniMonthCalendar({
  year,
  month,             // 0-indexed
  shootMarkers,      // Map<'YYYY-MM-DD', bookingIds[]>
  today = new Date(),
  className,
}: {
  year: number;
  month: number;
  shootMarkers: Map<string, string[]>;
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

      <div className="grid grid-cols-7 gap-y-1.5 text-center">
        {DAY_LABELS.map((d) => (
          <div key={d} className="text-[9px] font-medium" style={{ color: PALETTE.muted }}>{d}</div>
        ))}
        {cells.map((c, i) => {
          if (c.day === null) {
            return <div key={`b-${i}`} />;
          }
          const markers = c.iso ? shootMarkers.get(c.iso) : null;
          const hasShoot = (markers?.length ?? 0) > 0;
          const isToday = c.iso === todayISO;
          return (
            <div
              key={c.iso}
              className="relative flex h-7 flex-col items-center justify-center rounded text-[11px]"
              style={{
                color: isToday ? PALETTE.bg : PALETTE.text,
                background: isToday ? PALETTE.accent : 'transparent',
                fontWeight: isToday ? 600 : 400,
              }}
              title={hasShoot ? `${markers!.length} shoot${markers!.length === 1 ? '' : 's'}` : undefined}
            >
              <span className="tabular-nums">{c.day}</span>
              {hasShoot && !isToday && (
                <span
                  aria-hidden
                  className="absolute bottom-0.5 h-1 w-1 rounded-full"
                  style={{ background: PALETTE.accent }}
                />
              )}
              {hasShoot && isToday && (
                <span
                  aria-hidden
                  className="absolute bottom-0.5 h-1 w-1 rounded-full"
                  style={{ background: PALETTE.bg, opacity: 0.85 }}
                />
              )}
            </div>
          );
        })}
      </div>

      <div className="mt-3 flex items-center gap-3 text-[10px]" style={{ color: PALETTE.muted }}>
        <span className="inline-flex items-center gap-1">
          <span className="inline-block h-1.5 w-1.5 rounded-full" style={{ background: PALETTE.accent }} />
          shoot day
        </span>
        <span>·</span>
        <span>{shootMarkers.size} day{shootMarkers.size === 1 ? '' : 's'} this month</span>
      </div>
    </Link>
  );
}
