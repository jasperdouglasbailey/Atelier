import { createServiceClient } from '@/lib/supabase/service';

// Health probes run as the service role on purpose. Their job is to verify
// that schema + indexes + embedded joins are working, not to test RLS.
// Running them through the authenticated client would mean unauthenticated
// monitors hit role-gated tables and always see failures (post Phase 5b
// RLS lockdown).

/**
 * Critical-query probes used by both `/api/health?probe=1` (for uptime
 * monitors) and the dashboard health banner. Centralised here so we don't
 * drift between the two surfaces.
 *
 * Each probe runs the smallest possible Supabase request that exercises the
 * column references / embedded joins that hot pages depend on. If a probe
 * returns an error, that page is broken — surface it loudly.
 */

export type QueryProbe =
  | { name: string; ok: true; rows: number; ms: number }
  | { name: string; ok: false; error: string; ms: number };

async function probe(
  name: string,
  fn: () => Promise<{ data: unknown[] | null; error: { message: string } | null }>,
): Promise<QueryProbe> {
  const start = Date.now();
  try {
    const { data, error } = await fn();
    const ms = Date.now() - start;
    if (error) return { name, ok: false, error: error.message, ms };
    return { name, ok: true, rows: data?.length ?? 0, ms };
  } catch (e) {
    return { name, ok: false, error: e instanceof Error ? e.message : String(e), ms: Date.now() - start };
  }
}

export async function runHealthProbes(): Promise<QueryProbe[]> {
  const supabase = createServiceClient();

  return Promise.all([
    probe('listBookings (active)', async () =>
      supabase
        .from('atelier_bookings')
        .select('id, state, booking_talent:atelier_booking_talent(talent:atelier_talent(name:working_name, discipline))')
        .limit(1),
    ),
    probe('listClients', async () =>
      supabase.from('atelier_clients').select('id, name').limit(1),
    ),
    probe('listTalent', async () =>
      supabase.from('atelier_talent').select('id, working_name, discipline').limit(1),
    ),
    probe('listCrew', async () =>
      supabase.from('atelier_crew').select('id, name, tier').limit(1),
    ),
    probe('listFeeLines', async () =>
      supabase.from('atelier_fee_lines').select('id, line_type, asf_rate').limit(1),
    ),
    probe('listBookingTalent', async () =>
      supabase.from('atelier_booking_talent').select('id, booking_id, talent_id, created_at').limit(1),
    ),
  ]);
}
