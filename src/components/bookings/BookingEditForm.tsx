'use client';

import { useRouter } from 'next/navigation';
import BookingFormFields from './BookingFormFields';
import { updateBookingAction } from '@/app/actions/bookings';
import type { BookingDetailRow } from '@/lib/data/bookings';
import type { Client, Brand, Talent, Location } from '@/lib/types/database';

type Props = {
  booking: BookingDetailRow;
  clients: Client[];
  brands: Brand[];
  talent: Talent[];
  locations: Location[];
  /** Current primary artist's talent_id, from the first booking_talent row. */
  primaryTalentId: string | null;
};

/**
 * Thin wrapper around BookingFormFields for editing existing bookings.
 * Handles the update action + post-save redirect.
 */
export default function BookingEditForm({
  booking,
  clients,
  brands,
  talent,
  locations,
  primaryTalentId,
}: Props) {
  const router = useRouter();
  return (
    <BookingFormFields
      mode="edit"
      initial={booking}
      initialPrimaryTalentId={primaryTalentId}
      clients={clients}
      brands={brands}
      talent={talent}
      locations={locations}
      onSubmit={async (formData) => {
        const result = await updateBookingAction(booking.id, formData);
        if ('error' in result) return { error: result.error ?? 'Unknown error' };
        return { ok: true, id: booking.id };
      }}
      onSuccessRedirect={(id) => {
        // id is undefined when user clicked Cancel (we re-use the same callback)
        if (id) router.push(`/bookings/${id}`);
        else router.back();
        router.refresh();
      }}
    />
  );
}
