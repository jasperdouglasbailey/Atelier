import { createClient } from '@/lib/supabase/server';

export interface CrewBookingRow {
  id: string;
  crew_id: string;
  crew_name: string;
  crew_role: string | null;
  crew_tier: string;
  role_on_booking: string | null;
  day_rate: number | null;
  status: string;
  booking_id: string;
  booking_ref: string | null;
  booking_title: string;
  booking_state: string;
  booking_tier: string;
  shoot_date_notes: string | null;
}

/**
 * Cross-cutting crew-bookings view. Returns all crew assignments
 * joined with booking + crew info for the crew-centric dashboard.
 */
export async function listCrewBookings(): Promise<CrewBookingRow[]> {
  const supabase = await createClient();

  const { data, error } = await supabase
    .from('atelier_booking_crew')
    .select(`
      id,
      crew_id,
      role_on_booking,
      day_rate,
      status,
      booking_id,
      crew:atelier_crew(name, primary_role, tier),
      booking:atelier_bookings(booking_ref, title, state, tier, shoot_date_notes)
    `)
    .order('crew_id');

  if (error) {
    console.error('[crew-bookings] list', error.message);
    return [];
  }

  return ((data ?? []) as unknown[]).map((row: unknown) => {
    const r = row as Record<string, unknown>;
    const crew = r.crew as Record<string, unknown> | null;
    const booking = r.booking as Record<string, unknown> | null;
    return {
      id: r.id as string,
      crew_id: r.crew_id as string,
      crew_name: (crew?.name as string) ?? 'Unknown',
      crew_role: (crew?.primary_role as string) ?? null,
      crew_tier: (crew?.tier as string) ?? 'regular_freelance',
      role_on_booking: r.role_on_booking as string | null,
      day_rate: r.day_rate as number | null,
      status: r.status as string,
      booking_id: r.booking_id as string,
      booking_ref: (booking?.booking_ref as string) ?? null,
      booking_title: (booking?.title as string) ?? 'Unknown',
      booking_state: (booking?.state as string) ?? 'brief_received',
      booking_tier: (booking?.tier as string) ?? 'content',
      shoot_date_notes: (booking?.shoot_date_notes as string) ?? null,
    };
  });
}
