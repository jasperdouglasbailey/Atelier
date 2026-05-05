/**
 * Auto-generated call sheet (Phase 4 #10).
 *
 * Pulls everything that should be on a call sheet from the booking:
 *   - Project header (client, brand, ref, dates)
 *   - Location with address (if room/location attached)
 *   - Talent list (working name, mobile)
 *   - Crew list (name, role, mobile)
 *   - Wardrobe / hair / makeup notes (if captured)
 *   - Schedule notes (shoot_date_notes free text)
 *   - Emergency contacts (the agency)
 *
 * No LLM in the loop here — call sheets are template-driven and need
 * to be 100% reliable. The LLM is reserved for the optional "anything
 * unusual?" pre-flight check we'd add later.
 */

import { notFound } from 'next/navigation';
import { getBooking } from '@/lib/data/bookings';
import { listBookingTalent, listBookingCrew } from '@/lib/data/quotes';
import { getAgencyConfig } from '@/lib/utils/agency-config';
import { formatDate } from '@/lib/utils/format';
import PrintActions from '../quote/PrintActions';
import { createClient } from '@/lib/supabase/server';

type Props = { params: Promise<{ id: string }> };

export default async function CallSheetPage({ params }: Props) {
  const { id } = await params;

  const [booking, bookingTalent, bookingCrew] = await Promise.all([
    getBooking(id),
    listBookingTalent(id),
    listBookingCrew(id),
  ]);

  if (!booking) notFound();

  // Talent details (need contact info — listBookingTalent only has booking-talent
  // join data, not the full talent record, so we fetch the talent rows we need)
  const supabase = await createClient();
  const talentIds = bookingTalent.map((t) => t.talent_id);
  const crewIds = bookingCrew.map((c) => c.crew_id);

  const [talentRows, crewRows] = await Promise.all([
    talentIds.length === 0
      ? Promise.resolve({ data: [] as Array<{ id: string; working_name: string; mobile: string | null }> })
      : supabase
          .from('atelier_talent')
          .select('id, working_name, mobile')
          .in('id', talentIds),
    crewIds.length === 0
      ? Promise.resolve({ data: [] as Array<{ id: string; name: string; mobile: string | null; primary_role: string | null }> })
      : supabase
          .from('atelier_crew')
          .select('id, name, mobile, primary_role')
          .in('id', crewIds),
  ]);

  const talentLookup = new Map((talentRows.data ?? []).map((t) => [t.id, t]));
  const crewLookup = new Map((crewRows.data ?? []).map((c) => [c.id, c]));

  const agency = getAgencyConfig();

  // Format shoot dates (Postgres daterange string e.g. '[2026-05-15,2026-05-17)')
  const shootDates = parseShootDates(booking.shoot_dates);

  return (
    <main className="mx-auto max-w-3xl p-8" style={{ color: '#1a1a1a', background: '#fff' }}>
      <PrintActions />

      <header className="mb-6 border-b pb-4" style={{ borderColor: '#1a1a1a' }}>
        <div className="text-[10px] uppercase tracking-widest" style={{ color: '#666' }}>Call Sheet</div>
        <h1 className="mt-1 text-2xl font-bold">{booking.title}</h1>
        <div className="mt-1 text-sm" style={{ color: '#444' }}>
          {booking.booking_ref ?? 'no reference'}
          {booking.client?.name ? ` · ${booking.client.name}` : ''}
          {booking.brand?.name ? ` · ${booking.brand.name}` : ''}
        </div>
      </header>

      {/* Schedule */}
      <section className="mb-5">
        <h2 className="mb-2 text-xs font-semibold uppercase tracking-wide" style={{ color: '#666' }}>Schedule</h2>
        <div className="grid grid-cols-2 gap-2 text-sm">
          <Row label="Shoot date" value={shootDates ?? '—'} />
          <Row label="Notes" value={booking.shoot_date_notes ?? '—'} />
          <Row label="Looks per talent" value={booking.looks_per_talent ?? '—'} />
          <Row label="Wardrobe" value={booking.wardrobe_responsibility ?? '—'} />
        </div>
      </section>

      {/* Location */}
      <section className="mb-5">
        <h2 className="mb-2 text-xs font-semibold uppercase tracking-wide" style={{ color: '#666' }}>Location</h2>
        <div className="text-sm whitespace-pre-line">{booking.shoot_location ?? '—'}</div>
      </section>

      {/* Talent */}
      <section className="mb-5">
        <h2 className="mb-2 text-xs font-semibold uppercase tracking-wide" style={{ color: '#666' }}>Talent</h2>
        {bookingTalent.length === 0 ? (
          <div className="text-sm" style={{ color: '#999' }}>No talent attached.</div>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr style={{ color: '#666', borderBottom: '1px solid #ddd' }}>
                <th className="py-1 text-left">Name</th>
                <th className="py-1 text-left">Role</th>
                <th className="py-1 text-left">Mobile</th>
                <th className="py-1 text-left">Confirmed</th>
              </tr>
            </thead>
            <tbody>
              {bookingTalent.map((bt) => {
                const t = talentLookup.get(bt.talent_id);
                return (
                  <tr key={bt.id} style={{ borderBottom: '1px solid #f0f0f0' }}>
                    <td className="py-1">{t?.working_name ?? '—'}</td>
                    <td className="py-1">{bt.role_on_booking ?? '—'}</td>
                    <td className="py-1 font-mono text-[12px]">{t?.mobile ?? '—'}</td>
                    <td className="py-1">{bt.confirmed ? '✓' : '–'}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </section>

      {/* Crew */}
      <section className="mb-5">
        <h2 className="mb-2 text-xs font-semibold uppercase tracking-wide" style={{ color: '#666' }}>Crew</h2>
        {bookingCrew.length === 0 ? (
          <div className="text-sm" style={{ color: '#999' }}>No crew attached.</div>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr style={{ color: '#666', borderBottom: '1px solid #ddd' }}>
                <th className="py-1 text-left">Name</th>
                <th className="py-1 text-left">Role</th>
                <th className="py-1 text-left">Mobile</th>
                <th className="py-1 text-left">Confirmed</th>
              </tr>
            </thead>
            <tbody>
              {bookingCrew.map((bc) => {
                const c = crewLookup.get(bc.crew_id);
                return (
                  <tr key={bc.id} style={{ borderBottom: '1px solid #f0f0f0' }}>
                    <td className="py-1">{c?.name ?? '—'}</td>
                    <td className="py-1">{bc.role_on_booking ?? c?.primary_role ?? '—'}</td>
                    <td className="py-1 font-mono text-[12px]">{c?.mobile ?? '—'}</td>
                    <td className="py-1">{bc.confirmed ? '✓' : '–'}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </section>

      {/* Brief / agency notes */}
      {(booking.agency_notes || booking.video_references || booking.retouch_note_format) && (
        <section className="mb-5">
          <h2 className="mb-2 text-xs font-semibold uppercase tracking-wide" style={{ color: '#666' }}>Notes</h2>
          {booking.agency_notes && (
            <div className="text-sm whitespace-pre-line mb-2">{booking.agency_notes}</div>
          )}
          {booking.video_references && (
            <div className="text-sm">
              <span style={{ color: '#666' }}>Video references: </span>
              {booking.video_references}
            </div>
          )}
          {booking.retouch_note_format && (
            <div className="text-sm">
              <span style={{ color: '#666' }}>Retouch format: </span>
              {booking.retouch_note_format}
            </div>
          )}
        </section>
      )}

      {/* Agency emergency contact */}
      <footer className="mt-8 pt-4 border-t" style={{ borderColor: '#ddd', color: '#666', fontSize: '11px' }}>
        <div className="font-semibold">{agency.name}</div>
        {agency.phone && <div>Producer: {agency.phone}</div>}
        {agency.email && <div>{agency.email}</div>}
        <div className="mt-3 text-[10px]">
          Generated {formatDate(new Date().toISOString())} · Call sheet for internal use only
        </div>
      </footer>
    </main>
  );
}

function Row({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div>
      <div className="text-[10px] uppercase tracking-wide" style={{ color: '#999' }}>{label}</div>
      <div>{value}</div>
    </div>
  );
}

/**
 * Parse a Postgres daterange like "[2026-05-15,2026-05-17)" into a
 * human-readable string. Returns null if the input is null or unparseable.
 * The end is exclusive per Postgres convention.
 */
function parseShootDates(dateStr: string | null): string | null {
  if (!dateStr) return null;
  const match = dateStr.match(/[\[(]([\d-]+),([\d-]+)[\])]/);
  if (!match) return null;
  const [, start, end] = match;
  // End is exclusive, so subtract 1 day for display
  const endDate = new Date(end);
  endDate.setDate(endDate.getDate() - 1);
  const endStr = endDate.toISOString().slice(0, 10);

  if (start === endStr) return formatDate(start);
  return `${formatDate(start)} – ${formatDate(endStr)}`;
}
