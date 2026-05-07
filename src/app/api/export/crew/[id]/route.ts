/**
 * Per-crew full data export — Australian Privacy Principle 12.
 *
 * Returns a single JSON blob with every row referencing this crew member:
 * the profile, all booking assignments, fee lines, and audit log entries.
 * Owner/partner only.
 */

import { createClient } from '@/lib/supabase/server';
import { getCurrentAppUser } from '@/lib/data/app-users';
import { logAudit } from '@/lib/utils/audit';
import { getCurrentActor } from '@/lib/utils/actor';

export const dynamic = 'force-dynamic';

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;

  const appUser = await getCurrentAppUser();
  if (!appUser || (appUser.role !== 'owner' && appUser.role !== 'partner')) {
    return new Response('Forbidden', { status: 403 });
  }

  const supabase = await createClient();

  const [
    { data: crew },
    { data: bookingCrew },
    { data: auditEntries },
  ] = await Promise.all([
    supabase.from('atelier_crew').select('*').eq('id', id).maybeSingle(),
    supabase.from('atelier_booking_crew').select('*').eq('crew_id', id),
    supabase.from('atelier_audit_log').select('*').eq('record_id', id).limit(500),
  ]);

  if (!crew) return new Response('Not found', { status: 404 });

  // For each booking, pull fee lines so payment history is complete
  const bookingIds = (bookingCrew ?? []).map((b) => (b as { booking_id: string }).booking_id);
  let feeLines: unknown[] = [];

  if (bookingIds.length > 0) {
    const { data: flData } = await supabase
      .from('atelier_fee_lines')
      .select('*')
      .in('booking_id', bookingIds);
    feeLines = flData ?? [];
  }

  const exportPayload = {
    export_type: 'crew_full',
    export_generated_at: new Date().toISOString(),
    privacy_principle_basis: 'APP 12 (access)',
    subject: {
      kind: 'crew',
      id,
      name: (crew as { name: string }).name,
    },
    records: {
      crew_profile: crew,
      booking_crew_assignments: bookingCrew ?? [],
      fee_lines: feeLines,
      audit_log_entries: auditEntries ?? [],
    },
    counts: {
      booking_assignments: (bookingCrew ?? []).length,
      fee_lines: feeLines.length,
      audit_entries: (auditEntries ?? []).length,
    },
  };

  await logAudit({
    userId: await getCurrentActor(),
    action: 'data_export_crew',
    tableName: 'atelier_crew',
    recordId: id,
    newValue: { counts: exportPayload.counts },
  }).catch(() => {});

  const filename = `atelier-crew-${id.slice(0, 8)}-${Date.now()}.json`;
  return new Response(JSON.stringify(exportPayload, null, 2), {
    status: 200,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Content-Disposition': `attachment; filename="${filename}"`,
      'Cache-Control': 'no-store',
    },
  });
}
