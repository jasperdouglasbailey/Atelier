'use client';

import { useRouter } from 'next/navigation';
import BookingFormFields from './BookingFormFields';
import { createBookingAction } from '@/app/actions/bookings';
import type { Client, Brand, Talent, Location } from '@/lib/types/database';

type Props = {
  clients: Client[];
  brands: Brand[];
  talent: Talent[];
  locations: Location[];
};

/**
 * Thin wrapper around BookingFormFields for new-booking creation.
 * All field UI lives in BookingFormFields; this wires the create action.
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
