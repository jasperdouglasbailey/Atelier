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
import { humanise } from '@/lib/utils/humanise';
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
      ? Promise.resolve({ data: [] as Array<{ id: string; working_name: string; mobile: string | null; dietary: string | null; drink_order: string | null }> })
      : supabase
          .from('atelier_talent')
          .select('id, working_name, mobile, dietary, drink_order')
          .in('id', talentIds),
    crewIds.length === 0
      ? Promise.resolve({ data: [] as Array<{ id: string; name: string; mobile: string | null; primary_role: string | null; dietary: string | null; drink_order: string | null }> })
      : supabase
          .from('atelier_crew')
          .select('id, name, mobile, primary_role, dietary, drink_order')
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
          <Row label="Call time" value={booking.call_time ?? '—'} />
          <Row label="Wrap time" value={booking.wrap_time ?? '—'} />
          <Row label="Looks per talent" value={booking.looks_per_talent ?? '—'} />
          {booking.shoot_date_notes && <Row label="Notes" value={booking.shoot_date_notes} />}
        </div>
      </section>

      {/* Location */}
      <section className="mb-5">
        <h2 className="mb-2 text-xs font-semibold uppercase tracking-wide" style={{ color: '#666' }}>Location</h2>
        <div className="text-sm whitespace-pre-line">{booking.shoot_location ?? '—'}</div>
      </section>

      {/* Talent — Jasper's house format: stacked Role / Name / Phone / Dietary / Drink */}
      <section className="mb-5">
        <h2 className="mb-2 text-xs font-semibold uppercase tracking-wide" style={{ color: '#666' }}>Artists</h2>
        {bookingTalent.length === 0 ? (
          <div className="text-sm" style={{ color: '#999' }}>No artists attached.</div>
        ) : (
          <div className="space-y-3">
            {bookingTalent.map((bt) => {
              const t = talentLookup.get(bt.talent_id);
              return (
                <PersonBlock
                  key={bt.id}
                  role={(bt.role_on_booking ?? t?.working_name?.split(' ')[0] ? bt.role_on_booking : null) ?? bt.role_on_booking ?? 'Artist'}
                  name={t?.working_name ?? '—'}
                  phone={t?.mobile ?? null}
                  dietary={t?.dietary ?? null}
                  drink={t?.drink_order ?? null}
                  confirmed={bt.confirmed}
                />
              );
            })}
          </div>
        )}
      </section>

      {/* Crew — same stacked format */}
      <section className="mb-5">
        <h2 className="mb-2 text-xs font-semibold uppercase tracking-wide" style={{ color: '#666' }}>Crew</h2>
        {bookingCrew.length === 0 ? (
          <div className="text-sm" style={{ color: '#999' }}>No crew attached.</div>
        ) : (
          <div className="space-y-3">
            {bookingCrew.map((bc) => {
              const c = crewLookup.get(bc.crew_id);
              return (
                <PersonBlock
                  key={bc.id}
                  role={bc.role_on_booking ?? c?.primary_role ?? 'Crew'}
                  name={c?.name ?? '—'}
                  phone={c?.mobile ?? null}
                  dietary={c?.dietary ?? null}
                  drink={c?.drink_order ?? null}
                  confirmed={bc.confirmed}
                />
              );
            })}
          </div>
        )}
      </section>

      {/* Brief / agency notes */}
      {booking.agency_notes && (
        <section className="mb-5">
          <h2 className="mb-2 text-xs font-semibold uppercase tracking-wide" style={{ color: '#666' }}>Notes</h2>
          <div className="text-sm whitespace-pre-line">{booking.agency_notes}</div>
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
 * Stacked person block — Jasper's house format for artist + crew on call sheets:
 *
 *   Role
 *   Full Name           [confirmed checkmark]
 *   Phone number
 *   Dietary requirements
 *   Drink order
 */
function PersonBlock({
  role, name, phone, dietary, drink, confirmed,
}: {
  role: string | null;
  name: string;
  phone: string | null;
  dietary: string | null;
  drink: string | null;
  confirmed: boolean;
}) {
  // Skip "NIL" / empty dietary so the block doesn't get noisy
  const dietaryLabel = dietary && !/^nil( diet)?$/i.test(dietary.trim()) ? dietary.trim() : null;
  return (
    <div className="text-sm" style={{ lineHeight: 1.5 }}>
      {role && (
        <div className="text-[10px] uppercase tracking-wider" style={{ color: '#999' }}>
          {humanise(role)}
        </div>
      )}
      <div className="font-semibold flex items-center gap-2">
        {name}
        {!confirmed && (
          <span className="text-[10px]" style={{ color: '#b45309' }}>(unconfirmed)</span>
        )}
      </div>
      {phone && <div className="font-mono text-[12px]">{phone}</div>}
      {dietaryLabel && <div className="text-[12px]">Dietary: {dietaryLabel}</div>}
      {drink && <div className="text-[12px]">Drink: {drink}</div>}
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
