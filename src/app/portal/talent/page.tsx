/**
 * Talent portal — what an artist sees about themselves.
 *
 * Sections:
 *   1. Profile header
 *   2. Pending holds — bookings waiting for the artist to accept or decline
 *   3. Upcoming shoot call sheets — location, date, team contacts
 *   4. Upcoming bookings — with rate acceptance + brief sign-off per booking
 *   5. Past bookings
 *   6. Data rights
 *
 * Deliberately does NOT show:
 *   - Other artists' rates or details
 *   - Client identities or grand_total figures (per privacy doctrine
 *     in master CLAUDE.md: "talent sees own fees only")
 */

import { redirect } from 'next/navigation';
import Link from 'next/link';
import { getCurrentAppUser } from '@/lib/data/app-users';
import { getTalentPortalData, getPortalCallSheets } from '@/lib/data/portal';
import PortalDataRights from '@/components/portal/PortalDataRights';
import HoldCard from '@/components/portal/HoldCard';
import CallSheetCard from '@/components/portal/CallSheetCard';
import {
  PALETTE,
  BOOKING_STATE_LABELS,
  STATE_COLORS,
  ARTIST_DISCIPLINE_LABELS,
} from '@/lib/utils/constants';
import { formatCurrency } from '@/lib/utils/format';
import { getAgencyConfig } from '@/lib/utils/agency-config';
import {
  respondToTalentHoldAction,
  acceptTalentRateAction,
  acknowledgeBriefAction,
} from '@/app/actions/portal';
import type { ArtistDiscipline, BookingState } from '@/lib/types/database';
import type { TalentPortalBookingRow } from '@/lib/data/portal';

export const dynamic = 'force-dynamic';

const TERMINAL = ['paid', 'released', 'cancelled', 'written_off'];
const HOLD_STATES = ['hold_requested', 'sent'];
const RATE_ACCEPT_STATES: BookingState[] = ['artists_crew_held', 'quote_confirmed', 'pre_production', 'shoot_live'];
const BRIEF_ACK_STATES: BookingState[] = ['pre_production', 'shoot_live'];

export default async function TalentPortalPage() {
  const user = await getCurrentAppUser();
  if (!user || user.role !== 'talent' || !user.talent_id) {
    redirect('/login?error=not_authorised');
  }

  const agency = getAgencyConfig();
  const data = await getTalentPortalData(user.talent_id);
  if (!data || !data.talent) {
    return (
      <div className="p-6">
        <p className="text-sm" style={{ color: PALETTE.muted }}>
          Could not load your profile. Please contact {agency.name}.
        </p>
      </div>
    );
  }

  const { talent, bookings } = data;

  const pendingHolds = bookings.filter((b) => HOLD_STATES.includes(b.status));
  const upcoming = bookings.filter((b) => !TERMINAL.includes(b.state) && !HOLD_STATES.includes(b.status));
  const past = bookings.filter((b) => TERMINAL.includes(b.state));

  const upcomingIds = upcoming.map((b) => b.bookingId);
  const callSheets = await getPortalCallSheets('talent', user.talent_id, upcomingIds);

  const compliance = {
    abn: Boolean(talent.abn),
    super: Boolean(talent.super_fund_name && talent.super_member_number),
  };

  return (
    <div className="p-4 sm:p-6 max-w-4xl mx-auto space-y-6">

      {/* Profile header */}
      <section className="rounded-lg border p-5" style={{ background: PALETTE.surface, borderColor: PALETTE.border }}>
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div>
            <h1 className="text-lg font-semibold" style={{ color: PALETTE.text }}>{talent.working_name}</h1>
            <div className="mt-1 text-xs" style={{ color: PALETTE.muted }}>
              {ARTIST_DISCIPLINE_LABELS[talent.discipline as ArtistDiscipline] ?? talent.discipline}
              {talent.specialty ? ` · ${talent.specialty}` : ''}
            </div>
          </div>
          <div className="text-right text-xs" style={{ color: PALETTE.muted }}>
            <div>{talent.email}</div>
            {talent.mobile && <div>{talent.mobile}</div>}
          </div>
        </div>

        <div className="mt-4 grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs">
          <Stat label="Default day rate" value={talent.default_day_rate ? formatCurrency(talent.default_day_rate) : '—'} />
          <Stat label="ABN" value={talent.abn ?? '—'} />
          <Stat label="GST registered" value={talent.gst_registered ? 'Yes' : 'No'} />
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
              key={b.bookingTalentId}
              bookingRef={b.bookingRef}
              title={b.title}
              shootDateNotes={b.shootDateNotes}
              dayRate={b.dayRate}
              onConfirm={() => respondToTalentHoldAction(b.bookingTalentId, 'confirmed')}
              onDecline={() => respondToTalentHoldAction(b.bookingTalentId, 'declined')}
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

      {/* Upcoming bookings with actions */}
      <section className="rounded-lg border p-4" style={{ background: PALETTE.surface, borderColor: PALETTE.border }}>
        <h2 className="mb-3 text-xs font-semibold uppercase tracking-wide" style={{ color: PALETTE.muted }}>
          Upcoming bookings ({upcoming.length})
        </h2>
        {upcoming.length === 0 ? (
          <p className="text-xs" style={{ color: PALETTE.muted }}>No upcoming bookings.</p>
        ) : (
          <div className="space-y-4">
            {upcoming.map((b) => (
              <TalentBookingRow
                key={b.bookingTalentId}
                row={b}
                showRateAccept={RATE_ACCEPT_STATES.includes(b.state as BookingState) && !b.rateAccepted && !!b.dayRate}
                showBriefAck={BRIEF_ACK_STATES.includes(b.state as BookingState) && !b.briefAcknowledgedAt}
              />
            ))}
          </div>
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
          <TalentBookingTable rows={past} />
        )}
      </section>

      <PortalDataRights type="talent" id={talent.id} name={talent.working_name} />

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

function TalentBookingRow({
  row, showRateAccept, showBriefAck,
}: {
  row: TalentPortalBookingRow;
  showRateAccept: boolean;
  showBriefAck: boolean;
}) {
  return (
    <div className="rounded border p-3 space-y-2" style={{ borderColor: PALETTE.border }}>
      <div className="flex items-start justify-between gap-2 flex-wrap">
        <div>
          <div className="text-sm font-medium" style={{ color: PALETTE.text }}>{row.title}</div>
          {row.bookingRef && <div className="font-mono text-[10px] mt-0.5" style={{ color: PALETTE.muted }}>{row.bookingRef}</div>}
        </div>
        <span
          className="rounded-full px-2 py-0.5 text-[10px] font-semibold"
          style={{ background: `${STATE_COLORS[row.state as BookingState]}22`, color: STATE_COLORS[row.state as BookingState] }}
        >
          {BOOKING_STATE_LABELS[row.state as BookingState]}
        </span>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 text-xs">
        {row.shootDateNotes && <div><span className="text-[10px] uppercase tracking-wide" style={{ color: PALETTE.muted }}>Date</span><div style={{ color: PALETTE.text }}>{row.shootDateNotes}</div></div>}
        {row.dayRate && <div><span className="text-[10px] uppercase tracking-wide" style={{ color: PALETTE.muted }}>Day rate</span><div style={{ color: PALETTE.text }}>{formatCurrency(row.dayRate)}</div></div>}
        {row.usageFee && <div><span className="text-[10px] uppercase tracking-wide" style={{ color: PALETTE.muted }}>Usage fee</span><div style={{ color: PALETTE.text }}>{formatCurrency(row.usageFee)}</div></div>}
      </div>

      {showRateAccept && (
        <form action={acceptTalentRateAction.bind(null, row.bookingTalentId)}>
          <div className="flex items-center justify-between rounded border px-3 py-2" style={{ borderColor: PALETTE.accent, background: `${PALETTE.accent}0d` }}>
            <span className="text-xs" style={{ color: PALETTE.text }}>
              Confirm your day rate of <strong>{formatCurrency(row.dayRate!)}</strong>
            </span>
            <button type="submit" className="rounded px-3 py-1 text-xs font-medium ml-3" style={{ background: PALETTE.accent, color: PALETTE.bg, border: 'none', cursor: 'pointer', whiteSpace: 'nowrap' }}>
              Accept rate
            </button>
          </div>
        </form>
      )}
      {row.rateAccepted && !showRateAccept && (
        <p className="text-[11px]" style={{ color: PALETTE.success }}>Rate accepted</p>
      )}

      {showBriefAck && (
        <form action={acknowledgeBriefAction.bind(null, row.bookingTalentId)}>
          <div className="flex items-center justify-between rounded border px-3 py-2" style={{ borderColor: PALETTE.warning, background: `${PALETTE.warning}0d` }}>
            <span className="text-xs" style={{ color: PALETTE.text }}>Confirm you have read the artist brief</span>
            <button type="submit" className="rounded px-3 py-1 text-xs font-medium ml-3" style={{ background: PALETTE.warning, color: '#1a1a1a', border: 'none', cursor: 'pointer', whiteSpace: 'nowrap' }}>
              Brief read
            </button>
          </div>
        </form>
      )}
      {row.briefAcknowledgedAt && !showBriefAck && (
        <p className="text-[11px]" style={{ color: PALETTE.muted }}>Brief acknowledged</p>
      )}
    </div>
  );
}

function TalentBookingTable({ rows }: { rows: TalentPortalBookingRow[] }) {
  return (
    <div className="overflow-x-auto">
    <table className="w-full text-xs">
      <thead>
        <tr style={{ color: PALETTE.muted, borderBottom: `1px solid ${PALETTE.border}` }}>
          <th className="py-2 text-left">Project</th>
          <th className="py-2 text-left">Date</th>
          <th className="py-2 text-left">Day rate</th>
          <th className="py-2 text-left">Usage fee</th>
          <th className="py-2 text-left">Status</th>
        </tr>
      </thead>
      <tbody>
        {rows.map((r) => (
          <tr key={r.bookingTalentId} style={{ borderBottom: `1px solid ${PALETTE.border}` }}>
            <td className="py-2">
              <div style={{ color: PALETTE.text }}>{r.title}</div>
              <div className="font-mono text-[10px]" style={{ color: PALETTE.muted }}>{r.bookingRef ?? '—'}</div>
            </td>
            <td className="py-2" style={{ color: PALETTE.muted }}>{r.shootDateNotes ?? '—'}</td>
            <td className="py-2">{r.dayRate ? formatCurrency(r.dayRate) : '—'}</td>
            <td className="py-2">{r.usageFee ? formatCurrency(r.usageFee) : '—'}</td>
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
    </div>
  );
}
