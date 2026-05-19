import { notFound } from 'next/navigation';
import Link from 'next/link';
import Topbar from '@/components/layout/Topbar';
import BookingEditForm from '@/components/bookings/BookingEditForm';
import { getBooking } from '@/lib/data/bookings';
import {
  getCachedActiveClients,
  getCachedActiveTalent,
  getCachedActiveLocations,
} from '@/lib/data/entities-cache';
import { listBookingTalent } from '@/lib/data/quotes';
import { PALETTE, ARTIST_DISCIPLINE_LABELS } from '@/lib/utils/constants';

type Props = { params: Promise<{ id: string }> };

export default async function BookingEditPage({ params }: Props) {
  const { id } = await params;
  // End Brand was dropped with migration 0071 — no brands fetch needed.
  // Locations + clients + talent all flow through the entities cache for
  // parity with /bookings/new.
  const [booking, clients, talent, locations, bookingTalent] = await Promise.all([
    getBooking(id),
    getCachedActiveClients(),
    getCachedActiveTalent(),
    getCachedActiveLocations(),
    listBookingTalent(id),
  ]);

  if (!booking) notFound();

  // Identify the current primary artist (first booking_talent row, by created_at)
  const primaryTalentId = bookingTalent[0]?.talent_id ?? null;

  return (
    <>
      <Topbar title={`Edit — ${booking.booking_ref ?? booking.title}`} />
      <div className="p-4 sm:p-6 max-w-2xl">
        <div className="mb-4">
          <Link
            href={`/bookings/${id}`}
            className="text-xs"
            style={{ color: PALETTE.accent }}
          >
            ← Back to booking
          </Link>
        </div>
        <div className="rounded-lg border p-6" style={{ background: PALETTE.surface, borderColor: PALETTE.border }}>
          <div className="flex items-start justify-between mb-6">
            <h2 className="text-base font-semibold" style={{ color: PALETTE.text }}>
              Edit Booking
            </h2>
            {bookingTalent.length > 0 && (
              <div className="flex flex-wrap gap-1.5">
                {bookingTalent.map((bt) => {
                  const t = bt as typeof bt & { talent?: { name: string; discipline: string | null } | null };
                  const name = t.talent?.name ?? '—';
                  const disc = t.talent?.discipline ? ARTIST_DISCIPLINE_LABELS[t.talent.discipline as keyof typeof ARTIST_DISCIPLINE_LABELS] : null;
                  return (
                    <span
                      key={bt.id}
                      className="rounded-full px-2.5 py-0.5 text-[10px] font-medium"
                      style={{ background: `${PALETTE.accent}18`, color: PALETTE.accent, border: `1px solid ${PALETTE.accent}33` }}
                    >
                      {name}{disc ? ` · ${disc}` : ''}
                    </span>
                  );
                })}
              </div>
            )}
          </div>
          <BookingEditForm
            booking={booking}
            clients={clients}
            talent={talent}
            locations={locations}
            primaryTalentId={primaryTalentId}
          />
        </div>
      </div>
    </>
  );
}
