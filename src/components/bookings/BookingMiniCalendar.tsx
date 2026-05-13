import { parseDateRangeRaw } from '@/lib/utils/daterange';
import { PALETTE } from '@/lib/utils/constants';

type Props = { shootDates: string | null };

const DOW_LABELS = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];

export default function BookingMiniCalendar({ shootDates }: Props) {
  if (!shootDates) return null;

  const { start, end } = parseDateRangeRaw(shootDates);
  if (!start) return null;

  const startDate = new Date(start + 'T00:00:00Z');
  const endDate = end
    ? (() => {
        const d = new Date(end + 'T00:00:00Z');
        d.setUTCDate(d.getUTCDate() - 1);
        return d;
      })()
    : new Date(start + 'T00:00:00Z');

  const year = startDate.getUTCFullYear();
  const month = startDate.getUTCMonth();

  const firstOfMonth = new Date(Date.UTC(year, month, 1));
  const daysInMonth = new Date(Date.UTC(year, month + 1, 0)).getUTCDate();
  const startDow = firstOfMonth.getUTCDay(); // 0=Sun

  // Build set of shoot day-of-month numbers within this month
  const shootDayNums = new Set<number>();
  const cur = new Date(startDate);
  while (cur <= endDate) {
    if (cur.getUTCFullYear() === year && cur.getUTCMonth() === month) {
      shootDayNums.add(cur.getUTCDate());
    }
    cur.setUTCDate(cur.getUTCDate() + 1);
  }

  const today = new Date();
  const todayNum =
    today.getFullYear() === year && today.getMonth() === month
      ? today.getDate()
      : null;

  const monthLabel = firstOfMonth.toLocaleDateString('en-AU', {
    month: 'long',
    year: 'numeric',
    timeZone: 'UTC',
  });

  // Grid: empty lead cells + day numbers, padded to multiple of 7
  const cells: (number | null)[] = [
    ...Array<null>(startDow).fill(null),
    ...Array.from({ length: daysInMonth }, (_, i) => i + 1),
  ];
  while (cells.length % 7 !== 0) cells.push(null);

  return (
    <div
      style={{
        borderBottom: `1px solid ${PALETTE.border}`,
        padding: '1rem',
        paddingBottom: '1.25rem',
      }}
    >
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
        {monthLabel}
      </div>

      {/* Day-of-week headers */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 2, marginBottom: 4 }}>
        {DOW_LABELS.map((d, i) => (
          <div
            key={i}
            style={{
              fontSize: 9,
              textAlign: 'center',
              color: PALETTE.muted,
              fontFamily: 'var(--font-dm-mono), monospace',
            }}
          >
            {d}
          </div>
        ))}
      </div>

      {/* Day cells */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 2 }}>
        {cells.map((day, i) => {
          const isShoot = day !== null && shootDayNums.has(day);
          const isToday = day !== null && day === todayNum;
          return (
            <div
              key={i}
              style={{
                fontSize: 10,
                textAlign: 'center',
                padding: '3px 0',
                borderRadius: 3,
                fontFamily: 'var(--font-dm-mono), monospace',
                background: isShoot ? PALETTE.accent : isToday ? 'var(--p-surface)' : 'transparent',
                color: isShoot ? '#fff' : day ? PALETTE.text : 'transparent',
                fontWeight: isShoot ? 600 : 400,
                outline: isToday && !isShoot ? `1px solid ${PALETTE.border}` : 'none',
              }}
            >
              {day ?? ''}
            </div>
          );
        })}
      </div>

      {shootDayNums.size > 0 && (
        <div
          style={{
            marginTop: '0.75rem',
            fontSize: 10,
            color: PALETTE.muted,
          }}
        >
          <span
            style={{
              display: 'inline-block',
              width: 8,
              height: 8,
              borderRadius: 2,
              background: PALETTE.accent,
              marginRight: 4,
              verticalAlign: 'middle',
            }}
          />
          {shootDayNums.size === 1 ? '1 shoot day' : `${shootDayNums.size} shoot days`}
        </div>
      )}
    </div>
  );
}
