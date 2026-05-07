/**
 * Per-client full data export — Australian Privacy Principle 12.
 *
 * Returns a single JSON blob with every row referencing this client:
 * the client profile, all bookings (and their fee lines + quote
 * versions + assignments), and the audit log entries. Owner/partner
 * only.
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
    { data: client },
    { data: bookings },
    { data: auditEntries },
  ] = await Promise.all([
    supabase.from('atelier_clients').select('*').eq('id', id).maybeSingle(),
    supabase.from('atelier_bookings').select('*').eq('client_id', id),
    supabase.from('atelier_audit_log').select('*').eq('record_id', id).limit(500),
  ]);

  if (!client) return new Response('Not found', { status: 404 });

  // For each booking, pull related fee_lines + quote_versions + assignments
  const bookingIds = (bookings ?? []).map((b) => (b as { id: string }).id);
  let feeLines: unknown[] = [];
  let quoteVersions: unknown[] = [];
  let bookingTalent: unknown[] = [];
  let bookingCrew: unknown[] = [];

  if (bookingIds.length > 0) {
    const [feeRes, qvRes, btRes, bcRes] = await Promise.all([
      supabase.from('atelier_fee_lines').select('*').in('booking_id', bookingIds),
      supabase.from('atelier_quote_versions').select('*').in('booking_id', bookingIds),
      supabase.from('atelier_booking_talent').select('*').in('booking_id', bookingIds),
      supabase.from('atelier_booking_crew').select('*').in('booking_id', bookingIds),
    ]);
    feeLines = feeRes.data ?? [];
    quoteVersions = qvRes.data ?? [];
    bookingTalent = btRes.data ?? [];
    bookingCrew = bcRes.data ?? [];
  }

  const exportPayload = {
    export_type: 'client_full',
    export_generated_at: new Date().toISOString(),
    privacy_principle_basis: 'APP 12 (access)',
    subject: {
      kind: 'client',
      id,
      name: (client as { name: string }).name,
      company: (client as { company: string | null }).company,
    },
    records: {
      client_profile: client,
      bookings: bookings ?? [],
      quote_versions: quoteVersions,
      fee_lines: feeLines,
      booking_talent_assignments: bookingTalent,
      booking_crew_assignments: bookingCrew,
      audit_log_entries: auditEntries ?? [],
    },
    counts: {
      bookings: (bookings ?? []).length,
      quote_versions: quoteVersions.length,
      fee_lines: feeLines.length,
      booking_talent: bookingTalent.length,
      booking_crew: bookingCrew.length,
      audit_entries: (auditEntries ?? []).length,
    },
  };

  await logAudit({
    userId: await getCurrentActor(),
    action: 'data_export_client',
    tableName: 'atelier_clients',
    recordId: id,
    newValue: { counts: exportPayload.counts },
  }).catch(() => {});

  const filename = `atelier-client-${id.slice(0, 8)}-${Date.now()}.json`;
  return new Response(JSON.stringify(exportPayload, null, 2), {
    status: 200,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Content-Disposition': `attachment; filename="${filename}"`,
      'Cache-Control': 'no-store',
    },
  });
}
