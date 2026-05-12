/**
 * Crew portal — what a crew member sees about themselves.
 *
 * Sections:
 *   1. Profile header (name, role, compliance hints)
 *   2. Pending holds — bookings waiting for the crew member to accept or decline
 *   3. Upcoming shoot call sheets — location, date, team contacts
 *   4. Confirmed upcoming bookings table
 *   5. Past bookings table
 *   6. Availability — self-report blocked dates
 *   7. Data rights
 *
 * Does NOT show: client identities, agency commission, other crew rates.
 */

import { redirect } from 'next/navigation';
import Link from 'next/link';
import { getCurrentAppUser } from '@/lib/data/app-users';
import { getCrewPortalData, getPortalCallSheets } from '@/lib/data/portal';
import PortalDataRights from '@/components/portal/PortalDataRights';
import HoldCard from '@/components/portal/HoldCard';
import UnavailabilityManager from '@/components/portal/UnavailabilityManager';
import CallSheetCard from '@/components/portal/CallSheetCard';
import {
  PALETTE,
  BOOKING_STATE_LABELS,
  STATE_COLORS,
  CREW_TIER_LABELS,
} from '@/lib/utils/constants';
import { formatCurrency } from '@/lib/utils/format';
import { humanise } from '@/lib/utils/humanise';
import { getAgencyConfig } from '@/lib/utils/agency-config';
import { respondToCrewHoldAction } from '@/app/actions/portal';
import type { BookingState } from '@/lib/types/database';
import type { CrewPortalBookingRow } from '@/lib/data/portal';

export const dynamic = 'force-dynamic';

const TERMINAL = ['paid', 'released', 'cancelled', 'written_off'];
const HOLD_STATES = ['hold_requested', 'sent'];

export default async function CrewPortalPage() {
  const user = await getCurrentAppUser();
  if (!user || user.role !== 'crew' || !user.crew_id) {
    redirect('/login?error=not_authorised');
  }

  const agency = getAgencyConfig();
  const data = await getCrewPortalData(user.crew_id);
  if (!data || !data.crew) {
    return (
      <div className="p-6">
        <p className="text-sm" style={{ color: PALETTE.muted }}>
          Could not load your profile. Please contact {agency.name}.
        </p>
      </div>
    );
  }

  const { crew, bookings, unavailability } = data;

  const pendingHolds = bookings.filter((b) => HOLD_STATES.includes(b.status));
  const upcoming = bookings.filter((b) => !TERMINAL.includes(b.state) && !HOLD_STATES.includes(b.status));
  const past = bookings.filter((b) => TERMINAL.includes(b.state));

  const upcomingIds = upcoming.map((b) => b.bookingId);
  const callSheets = await getPortalCallSheets('crew', user.crew_id, upcomingIds);

  const compliance = {
    abn: Boolean(crew.abn),
    super: Boolean(crew.super_fund_name && crew.super_member_number),
  };

  return (
    <div className="p-4 sm:p-6 max-w-4xl mx-auto space-y-6">

      {/* Profile header */}
      <section className="rounded-lg border p-5" style={{ background: PALETTE.surface, borderColor: PALETTE.border }}>
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div>
            <h1 className="text-lg font-semibold" style={{ color: PALETTE.text }}>{crew.name}</h1>
            <div className="mt-1 text-xs" style={{ color: PALETTE.muted }}>
              {crew.primary_role
                ? [crew.primary_role, ...(crew.secondary_roles ?? [])].map(humanise).join(' / ')
                : '—'} · {CREW_TIER_LABELS[crew.tier]}
            </div>
          </div>
          <div className="text-right text-xs" style={{ color: PALETTE.muted }}>
            <div>{crew.email ?? '—'}</div>
            {crew.mobile && <div>{crew.mobile}</div>}
          </div>
        </div>

        <div className="mt-4 grid grid-cols-3 gap-3 text-xs">
          <Stat label="Default day rate" value={crew.default_day_rate ? formatCurrency(crew.default_day_rate) : '—'} />
          <Stat label="ABN" value={crew.abn ?? '—'} />
          <Stat label="GST registered" value={crew.gst_registered ? 'Yes' : 'No'} />
        </div>

        {(!compliance.abn || !compliance.super) && (
          <div className="mt-4 rounded border-l-2 px-3 py-2 text-xs" style={{ borderColor: PALETTE.warning, background: `${PALETTE.warning}11`, color: PALETTE.text }}>
            <div className="font-semibold" style={{ color: PALETTE.warning }}>Some details still missing</div>
            <div className="mt-1" style={{ color: PALETTE.muted }}>
              {!compliance.abn && 'Add your ABN. '}
              {!compliance.super && 'Add your super fund name + member number. '}
              {agency.name} will email you a personalised link to update these.
            </div>
          </div>
        )}
      </section>

      {/* Pending holds */}
      {pendingHolds.length > 0 && (
        <section className="space-y-3">
          <h2 className="text-xs font-semibold uppercase tracking-wide" style={{ color: PALETTE.warning }}>
            Action needed — {pendingHolds.length} hold{pendingHolds.length > 1 ? 's' : ''} waiting
          </h2>
          {pendingHolds.map((b) => (
            <HoldCard
              key={b.bookingCrewId}
              bookingRef={b.bookingRef}
              title={b.title}
              shootDateNotes={b.shootDateNotes}
              dayRate={b.dayRate}
              roleOnBooking={b.roleOnBooking}
              onConfirm={() => respondToCrewHoldAction(b.bookingCrewId, 'confirmed')}
              onDecline={() => respondToCrewHoldAction(b.bookingCrewId, 'declined')}
            />
          ))}
        </section>
      )}

      {/* Upcoming shoot call sheets */}
      {callSheets.length > 0 && (
        <section className="space-y-3">
          <h2 className="text-xs font-semibold uppercase tracking-wide" style={{ color: PALETTE.muted }}>
            Upcoming shoots
          </h2>
          {callSheets.map((sheet) => (
            <CallSheetCard key={sheet.bookingId} sheet={sheet} />
          ))}
        </section>
      )}

      {/* Confirmed upcoming bookings */}
      <section className="rounded-lg border p-4" style={{ background: PALETTE.surface, borderColor: PALETTE.border }}>
        <h2 className="mb-3 text-xs font-semibold uppercase tracking-wide" style={{ color: PALETTE.muted }}>
          Confirmed bookings ({upcoming.length})
        </h2>
        {upcoming.length === 0 ? (
          <p className="text-xs" style={{ color: PALETTE.muted }}>No confirmed bookings.</p>
        ) : (
          <CrewBookingTable rows={upcoming} />
        )}
      </section>

      {/* Past bookings */}
      <section className="rounded-lg border p-4" style={{ background: PALETTE.surface, borderColor: PALETTE.border }}>
        <h2 className="mb-3 text-xs font-semibold uppercase tracking-wide" style={{ color: PALETTE.muted }}>
          Past bookings ({past.length})
        </h2>
        {past.length === 0 ? (
          <p className="text-xs" style={{ color: PALETTE.muted }}>No past bookings yet.</p>
        ) : (
          <CrewBookingTable rows={past} />
        )}
      </section>

      {/* Availability */}
      <section className="rounded-lg border p-4" style={{ background: PALETTE.surface, borderColor: PALETTE.border }}>
        <h2 className="mb-1 text-xs font-semibold uppercase tracking-wide" style={{ color: PALETTE.muted }}>
          My availability
        </h2>
        <p className="mb-3 text-[11px]" style={{ color: PALETTE.muted }}>
          Mark dates you are unavailable so {agency.name} can see conflicts before sending hold requests.
        </p>
        <UnavailabilityManager initial={unavailability} />
      </section>

      <PortalDataRights type="crew" id={crew.id} name={crew.name} />

      <p className="text-[10px] text-center" style={{ color: PALETTE.muted }}>
        {agency.name}{agency.email && <> · <Link href={`mailto:${agency.email}`} style={{ color: PALETTE.muted }} className="underline">{agency.email}</Link></>} · <Link href="/privacy" style={{ color: PALETTE.muted }} className="underline">Privacy</Link>
      </p>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="text-[10px] uppercase tracking-wide" style={{ color: PALETTE.muted }}>{label}</div>
      <div className="mt-0.5 text-sm" style={{ color: PALETTE.text }}>{value}</div>
    </div>
  );
}

function CrewBookingTable({ rows }: { rows: CrewPortalBookingRow[] }) {
  return (
    <table className="w-full text-xs">
      <thead>
        <tr style={{ color: PALETTE.muted, borderBottom: `1px solid ${PALETTE.border}` }}>
          <th className="py-2 text-left">Project</th>
          <th className="py-2 text-left">Date</th>
          <th className="py-2 text-left">Role</th>
          <th className="py-2 text-left">Day rate</th>
          <th className="py-2 text-left">Status</th>
        </tr>
      </thead>
      <tbody>
        {rows.map((r) => (
          <tr key={r.bookingCrewId} style={{ borderBottom: `1px solid ${PALETTE.border}` }}>
            <td className="py-2">
              <div style={{ color: PALETTE.text }}>{r.title}</div>
              <div className="font-mono text-[10px]" style={{ color: PALETTE.muted }}>{r.bookingRef ?? '—'}</div>
            </td>
            <td className="py-2" style={{ color: PALETTE.muted }}>{r.shootDateNotes ?? '—'}</td>
            <td className="py-2" style={{ color: PALETTE.muted }}>{r.roleOnBooking ? humanise(r.roleOnBooking) : '—'}</td>
            <td className="py-2">{r.dayRate ? formatCurrency(r.dayRate) : '—'}</td>
            <td className="py-2">
              <span
                className="rounded-full px-2 py-0.5 text-[10px] font-semibold"
                style={{ background: `${STATE_COLORS[r.state as BookingState]}22`, color: STATE_COLORS[r.state as BookingState] }}
              >
                {BOOKING_STATE_LABELS[r.state as BookingState]}
              </span>
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
