import Link from 'next/link';
import { PALETTE } from '@/lib/utils/constants';
import { humanise } from '@/lib/utils/humanise';
import SectionCard from '@/components/ui/SectionCard';
import type { ThisWeekTalent, ThisWeekCrew, JobNeedingCrew } from '@/lib/data/dashboard';

/**
 * Three small cards showing who is doing what this week:
 *   1. Talent working this week (links each artist → /talent/[id])
 *   2. Crew on hold this week (status ≠ confirmed) — links → /crew/[id]
 *   3. Jobs needing crew confirmed — links each booking → /bookings/[id]
 *
 * Each card has its own click-through action in the header.
 */
export default function ThisWeekStrip({
  talent,
  crewOnHold,
  jobsNeedingCrew,
}: {
  talent: ThisWeekTalent[];
  crewOnHold: ThisWeekCrew[];
  jobsNeedingCrew: JobNeedingCrew[];
}) {
  // Dedup talent by talentId — same person on two shoots this week appears once.
  const talentMap = new Map<string, ThisWeekTalent>();
  for (const t of talent) {
    if (!talentMap.has(t.talentId)) talentMap.set(t.talentId, t);
  }
  const uniqueTalent = Array.from(talentMap.values());

  // Group crew by crewId so a crew member appears once, with all booking refs.
  const crewMap = new Map<string, { row: ThisWeekCrew; bookingRefs: string[] }>();
  for (const c of crewOnHold) {
    const existing = crewMap.get(c.crewId);
    if (existing) {
      if (c.bookingRef) existing.bookingRefs.push(c.bookingRef);
    } else {
      crewMap.set(c.crewId, { row: c, bookingRefs: c.bookingRef ? [c.bookingRef] : [] });
    }
  }
  const uniqueCrew = Array.from(crewMap.values());

  return (
    <div className="grid gap-4 lg:grid-cols-3">
      <SectionCard
        title="Talent working this week"
        meta={`${uniqueTalent.length}`}
        action={{ label: 'All talent', href: '/talent' }}
      >
        {uniqueTalent.length === 0 ? (
          <p className="text-[11px]" style={{ color: PALETTE.muted }}>No talent on shoots this week.</p>
        ) : (
          <ul className="space-y-1">
            {uniqueTalent.slice(0, 8).map((t) => (
              <li key={t.talentId}>
                <Link
                  href={`/talent/${t.talentId}`}
                  className="flex items-baseline justify-between gap-2 rounded px-2 py-1 transition hover:opacity-80"
                  style={{ background: PALETTE.bg }}
                >
                  <span className="text-xs font-medium truncate" style={{ color: PALETTE.text }}>
                    {t.name}
                  </span>
                  <span className="text-[10px] font-mono flex-none" style={{ color: PALETTE.accent }}>
                    {t.bookingRef ?? ''}
                  </span>
                </Link>
              </li>
            ))}
            {uniqueTalent.length > 8 && (
              <li className="px-2 text-[10px]" style={{ color: PALETTE.muted }}>
                + {uniqueTalent.length - 8} more
              </li>
            )}
          </ul>
        )}
      </SectionCard>

      <SectionCard
        title="Crew on hold this week"
        meta={`${uniqueCrew.length}`}
        action={{ label: 'All crew', href: '/crew' }}
      >
        {uniqueCrew.length === 0 ? (
          <p className="text-[11px]" style={{ color: PALETTE.muted }}>
            All crew this week are confirmed. Nothing pending.
          </p>
        ) : (
          <ul className="space-y-1">
            {uniqueCrew.slice(0, 8).map(({ row, bookingRefs }) => (
              <li key={row.crewId}>
                <Link
                  href={`/crew/${row.crewId}`}
                  className="flex items-baseline justify-between gap-2 rounded px-2 py-1 transition hover:opacity-80"
                  style={{ background: PALETTE.bg }}
                >
                  <div className="min-w-0 flex-1">
                    <div className="text-xs font-medium truncate" style={{ color: PALETTE.text }}>
                      {row.name}
                    </div>
                    <div className="text-[10px]" style={{ color: PALETTE.muted }}>
                      {row.role ? humanise(row.role) : 'role tbd'} · <span style={{ color: PALETTE.warning }}>{humanise(row.status)}</span>
                    </div>
                  </div>
                  <span className="text-[10px] font-mono flex-none" style={{ color: PALETTE.accent }}>
                    {bookingRefs[0] ?? ''}
                    {bookingRefs.length > 1 && ` +${bookingRefs.length - 1}`}
                  </span>
                </Link>
              </li>
            ))}
            {uniqueCrew.length > 8 && (
              <li className="px-2 text-[10px]" style={{ color: PALETTE.muted }}>
                + {uniqueCrew.length - 8} more
              </li>
            )}
          </ul>
        )}
      </SectionCard>

      <SectionCard
        title="Jobs needing crew"
        meta={`${jobsNeedingCrew.length}`}
        action={{ label: 'All bookings', href: '/bookings' }}
      >
        {jobsNeedingCrew.length === 0 ? (
          <p className="text-[11px]" style={{ color: PALETTE.muted }}>
            All confirmed bookings are fully crewed.
          </p>
        ) : (
          <ul className="space-y-1">
            {jobsNeedingCrew.slice(0, 8).map((j) => (
              <li key={j.bookingId}>
                <Link
                  href={`/bookings/${j.bookingId}`}
                  className="flex items-baseline justify-between gap-2 rounded px-2 py-1 transition hover:opacity-80"
                  style={{ background: PALETTE.bg }}
                >
                  <div className="min-w-0 flex-1">
                    <div className="flex items-baseline gap-1.5">
                      <span className="text-[10px] font-mono flex-none" style={{ color: PALETTE.accent }}>
                        {j.bookingRef ?? ''}
                      </span>
                      <span className="text-xs truncate" style={{ color: PALETTE.text }}>{j.title}</span>
                    </div>
                    {j.shootDateNotes && (
                      <div className="text-[10px]" style={{ color: PALETTE.muted }}>{j.shootDateNotes}</div>
                    )}
                  </div>
                  <span
                    className="rounded-full px-1.5 py-0.5 text-[10px] font-semibold tabular-nums flex-none"
                    style={{ background: `${PALETTE.warning}22`, color: PALETTE.warning }}
                  >
                    {j.unconfirmedCount} unconfirmed
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </SectionCard>
    </div>
  );
}
