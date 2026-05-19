'use client';

import { useRouter } from 'next/navigation';
import BookingFormFields from './BookingFormFields';
import { createBookingAction } from '@/app/actions/bookings';
import type { Client, Talent, Location } from '@/lib/types/database';

type Props = {
  clients: Client[];
  talent: Talent[];
  locations: Location[];
};

/**
 * Thin wrapper around BookingFormFields for new-booking creation.
 * All field UI lives in BookingFormFields; this wires the create action.
 *
 * End-brand prop dropped 2026-05-19 (migration 0071) — bookings no
 * longer carry a brand_id. Brands stay on the campaigns surface.
 */
export default function BookingForm(props: Props) {
  const router = useRouter();
  return (
    <BookingFormFields
      mode="create"
      {...props}
      onSubmit={async (formData) => {
        const result = await createBookingAction(formData);
        if ('error' in result) return { error: result.error ?? 'Unknown error' };
        return { ok: true, id: result.id };
      }}
      onSuccessRedirect={(id) => {
        if (id) {
          router.push(`/bookings/${id}`);
          router.refresh();
        }
      }}
    />
  );
}
