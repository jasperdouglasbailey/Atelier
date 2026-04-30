import Link from 'next/link';
import Topbar from '@/components/layout/Topbar';
import { listCrewBookings, type CrewBookingRow } from '@/lib/data/crew-bookings';
import { PALETTE, BOOKING_STATE_LABELS, STATE_COLORS, SHOOT_TIER_LABELS, CREW_TIER_LABELS } from '@/lib/utils/constants';
import { formatCurrency } from '@/lib/utils/format';
import type { BookingState, ShootTier, CrewTier } from '@/lib/types/database';

export default async function CrewBookingsPage() {
  const rows = await listCrewBookings();

  // Group by crew member
  const grouped = new Map<string, { name: string; role: string | null; tier: string; bookings: CrewBookingRow[] }>();
  for (const r of rows) {
    if (!grouped.has(r.crew_id)) {
      grouped.set(r.crew_id, { name: r.crew_name, role: r.crew_role, tier: r.crew_tier, bookings: [] });
    }
    grouped.get(r.crew_id)!.bookings.push(r);
  }

  const crewList = Array.from(grouped.entries()).sort((a, b) => a[1].name.localeCompare(b[1].name));

  const tierColor = (tier: string) => {
    if (tier === 'preferred_core') return PALETTE.success;
    if (tier === 'never_again') return PALETTE.danger;
    return PALETTE.muted;
  };

  return (
    <>
      <Topbar title="Crew Bookings" />
      <div className="p-4 sm:p-6">
        <p className="mb-4 text-xs" style={{ color: PALETTE.muted }}>
          {crewList.length} crew member{crewList.length !== 1 ? 's' : ''} with {rows.length} assignment{rows.length !== 1 ? 's' : ''}
        </p>

        {crewList.length === 0 ? (
          <p className="py-12 text-center text-sm" style={{ color: PALETTE.muted }}>
            No crew assignments yet. Assign crew to bookings to see them here.
          </p>
        ) : (
          <div className="space-y-4">
            {crewList.map(([crewId, group]) => (
              <section key={crewId} className="rounded-lg border p-4" style={{ background: PALETTE.surface, borderColor: PALETTE.border }}>
                <div className="flex items-center justify-between mb-3">
                  <div className="flex items-center gap-2">
                    <Link href={`/crew/${crewId}`} className="text-sm font-medium hover:underline" style={{ color: PALETTE.text }}>
                      {group.name}
                    </Link>
                    {group.role && (
                      <span className="text-[10px] capitalize" style={{ color: PALETTE.accent }}>
                        {group.role.replace(/_/g, ' ')}
                      </span>
                    )}
                  </div>
                  <span className="rounded-full px-2 py-0.5 text-[10px] font-semibold" style={{ background: `${tierColor(group.tier)}22`, color: tierColor(group.tier) }}>
                    {CREW_TIER_LABELS[group.tier as CrewTier] ?? group.tier}
                  </span>
                </div>

                <div className="space-y-1">
                  {group.bookings.map((b) => (
                    <Link
                      key={b.id}
                      href={`/bookings/${b.booking_id}`}
                      className="flex items-center justify-between rounded border px-3 py-2 transition hover:border-opacity-80"
                      style={{ borderColor: PALETTE.border }}
                    >
                      <div className="flex items-center gap-3">
                        <span
                          className="rounded-full px-2 py-0.5 text-[10px] font-semibold"
                          style={{
                            background: `${STATE_COLORS[b.booking_state as BookingState]}22`,
                            color: STATE_COLORS[b.booking_state as BookingState],
                          }}
                        >
                          {BOOKING_STATE_LABELS[b.booking_state as BookingState]}
                        </span>
                        <span className="text-xs" style={{ color: PALETTE.text }}>
                          {b.booking_ref ?? b.booking_title}
                        </span>
                        <span className="text-[10px]" style={{ color: PALETTE.muted }}>
                          {SHOOT_TIER_LABELS[b.booking_tier as ShootTier]}
                        </span>
                      </div>
                      <div className="flex items-center gap-3 text-[10px]" style={{ color: PALETTE.muted }}>
                        {b.role_on_booking && <span>{b.role_on_booking}</span>}
                        {b.day_rate != null && <span className="tabular-nums">{formatCurrency(b.day_rate)}/day</span>}
                        <span className="capitalize">{b.status}</span>
                        {b.shoot_date_notes && <span>{b.shoot_date_notes}</span>}
                      </div>
                    </Link>
                  ))}
                </div>
              </section>
            ))}
          </div>
        )}
      </div>
    </>
  );
}
