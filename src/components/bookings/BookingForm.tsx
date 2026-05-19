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
      onSuccessRedirect={(id, opts) => {
        if (id) {
          // When the operator pasted a brief into the create form, route
          // to the parser anchor with ?action=parse so the LLM auto-runs
          // on mount — saves them the manual "Parse brief" click.
          const suffix = opts?.hasBriefText ? '?action=parse#brief-parser' : '';
          router.push(`/bookings/${id}${suffix}`);
          router.refresh();
        }
      }}
    />
  );
}
