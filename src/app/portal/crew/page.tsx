/**
 * Crew portal — what a crew member sees about themselves.
 *
 * Same shape as talent portal but using crew data:
 *   - Their profile + role
 *   - Bookings they're attached to with day rate + role-on-booking
 *   - Compliance status (ABN, super, GST)
 *
 * Does NOT show: client identities, agency commission, other crew rates.
 */

import { redirect } from 'next/navigation';
import Link from 'next/link';
import { getCurrentAppUser } from '@/lib/data/app-users';
import { getCrewPortalData } from '@/lib/data/portal';
import PortalDataRights from '@/components/portal/PortalDataRights';
import {
  PALETTE,
  BOOKING_STATE_LABELS,
  STATE_COLORS,
  CREW_TIER_LABELS,
} from '@/lib/utils/constants';
import { formatCurrency } from '@/lib/utils/format';
import { humanise } from '@/lib/utils/humanise';
import type { BookingState } from '@/lib/types/database';

export const dynamic = 'force-dynamic';

export default async function CrewPortalPage() {
  const user = await getCurrentAppUser();
  if (!user || user.role !== 'crew' || !user.crew_id) {
    redirect('/login?error=not_authorised');
  }

  const data = await getCrewPortalData(user.crew_id);
  if (!data || !data.crew) {
    return (
      <div className="p-6">
        <p className="text-sm" style={{ color: PALETTE.muted }}>
          Could not load your profile. Please contact Saunders &amp; Co.
        </p>
      </div>
    );
  }

  const { crew, bookings } = data;
  const upcoming = bookings.filter((b) => !['paid', 'released', 'cancelled'].includes(b.state));
  const past = bookings.filter((b) => ['paid', 'released', 'cancelled'].includes(b.state));

  const compliance = {
    abn: Boolean(crew.abn),
    super: Boolean(crew.super_fund_name && crew.super_member_number),
  };

  return (
    <div className="p-4 sm:p-6 max-w-4xl mx-auto space-y-6">
      <section
        className="rounded-lg border p-5"
        style={{ background: PALETTE.surface, borderColor: PALETTE.border }}
      >
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
          <div
            className="mt-4 rounded border-l-2 px-3 py-2 text-xs"
            style={{
              borderColor: PALETTE.warning,
              background: `${PALETTE.warning}11`,
              color: PALETTE.text,
            }}
          >
            <div className="font-semibold" style={{ color: PALETTE.warning }}>Some details still missing</div>
            <div className="mt-1" style={{ color: PALETTE.muted }}>
              {!compliance.abn && 'Add your ABN. '}
              {!compliance.super && 'Add your super fund name + member number. '}
              Saunders &amp; Co will email you a personalised link to update these.
            </div>
          </div>
        )}
      </section>

      <section className="rounded-lg border p-4" style={{ background: PALETTE.surface, borderColor: PALETTE.border }}>
        <h2 className="mb-3 text-xs font-semibold uppercase tracking-wide" style={{ color: PALETTE.muted }}>
          Upcoming bookings ({upcoming.length})
        </h2>
        {upcoming.length === 0 ? (
          <p className="text-xs" style={{ color: PALETTE.muted }}>No upcoming bookings.</p>
        ) : (
          <BookingTable rows={upcoming} />
        )}
      </section>

      <section className="rounded-lg border p-4" style={{ background: PALETTE.surface, borderColor: PALETTE.border }}>
        <h2 className="mb-3 text-xs font-semibold uppercase tracking-wide" style={{ color: PALETTE.muted }}>
          Past bookings ({past.length})
        </h2>
        {past.length === 0 ? (
          <p className="text-xs" style={{ color: PALETTE.muted }}>No past bookings yet.</p>
        ) : (
          <BookingTable rows={past} />
        )}
      </section>

      <PortalDataRights type="crew" id={crew.id} name={crew.name} />

      <p className="text-[10px] text-center" style={{ color: PALETTE.muted }}>
        Saunders &amp; Co · <Link href="mailto:info@saundersandco.com.au" style={{ color: PALETTE.muted }} className="underline">info@saundersandco.com.au</Link> · <Link href="/privacy" style={{ color: PALETTE.muted }} className="underline">Privacy</Link>
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

function BookingTable({
  rows,
}: {
  rows: Array<{
    bookingId: string;
    bookingRef: string | null;
    title: string;
    state: BookingState;
    shootDateNotes: string | null;
    tier: string;
    dayRate: number | null;
    confirmed: boolean;
    roleOnBooking: string | null;
  }>;
}) {
  return (
    <table className="w-full text-xs">
      <thead>
        <tr style={{ color: PALETTE.muted, borderBottom: `1px solid ${PALETTE.border}` }}>
          <th className="py-2 text-left">Project</th>
          <th className="py-2 text-left">Date</th>
          <th className="py-2 text-left">Role</th>
          <th className="py-2 text-left">Day rate</th>
          <th className="py-2 text-left">State</th>
          <th className="py-2 text-left">Confirmed</th>
        </tr>
      </thead>
      <tbody>
        {rows.map((r) => (
          <tr key={r.bookingId} style={{ borderBottom: `1px solid ${PALETTE.border}` }}>
            <td className="py-2">
              <div style={{ color: PALETTE.text }}>{r.title}</div>
              <div className="font-mono text-[10px]" style={{ color: PALETTE.muted }}>{r.bookingRef ?? '—'}</div>
            </td>
            <td className="py-2" style={{ color: PALETTE.muted }}>{r.shootDateNotes ?? '—'}</td>
            <td className="py-2">{r.roleOnBooking ?? '—'}</td>
            <td className="py-2">{r.dayRate ? formatCurrency(r.dayRate) : '—'}</td>
            <td className="py-2">
              <span
                className="rounded-full px-2 py-0.5 text-[10px] font-semibold"
                style={{ background: `${STATE_COLORS[r.state]}22`, color: STATE_COLORS[r.state] }}
              >
                {BOOKING_STATE_LABELS[r.state]}
              </span>
            </td>
            <td className="py-2">{r.confirmed ? '✓' : '–'}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
