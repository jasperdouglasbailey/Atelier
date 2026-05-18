'use client';

/**
 * Read-only wrapper around <PortalCalendar> for agency-side display on
 * /talent/[id] and /crew/[id] detail pages.
 *
 * Renders the same calendar the person sees in their portal (booked
 * days + their own blockouts) but with the action panel disabled.
 * Future enhancement could let the agency block out days ON BEHALF of
 * the person, but for now this is strictly view-only.
 */

import PortalCalendar, { type CalendarBooking, type CalendarUnavailability } from '@/components/portal/PortalCalendar';
import { PALETTE } from '@/lib/utils/constants';

type Props = {
  bookings: CalendarBooking[];
  unavailability: CalendarUnavailability[];
  /** Person's first name for the header — "Oliver's calendar". */
  personName: string;
};

// No-op stubs for the required PortalCalendar callbacks. Never invoked
// because readOnly mode short-circuits the action panel.
async function noopAdd(): Promise<{ ok: false; error: string }> {
  return { ok: false, error: 'Read-only — use the portal to manage blockouts' };
}
async function noopRemove(): Promise<{ ok: false; error: string }> {
  return { ok: false, error: 'Read-only — use the portal to manage blockouts' };
}

export default function AgencyPersonCalendar({ bookings, unavailability, personName }: Props) {
  return (
    <section className="rounded-lg border p-4" style={{ background: PALETTE.surface, borderColor: PALETTE.border }}>
      <div className="mb-3 flex items-baseline justify-between gap-2">
        <h2 className="section-title">{personName}&apos;s calendar</h2>
        <span className="text-[10px]" style={{ color: PALETTE.muted }}>
          Bookings shown in colour · Blockouts in grey · Read-only
        </span>
      </div>
      <PortalCalendar
        bookings={bookings}
        unavailability={unavailability}
        onAdd={noopAdd}
        onRemove={noopRemove}
        readOnly
      />
    </section>
  );
}
