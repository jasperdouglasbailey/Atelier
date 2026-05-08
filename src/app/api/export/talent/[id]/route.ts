/**
 * Per-talent full data export — Australian Privacy Principle 12.
 *
 * Returns a single JSON blob containing every row in the database that
 * references this talent. Used for "give me everything you have on me"
 * subject access requests.
 *
 * Owner/partner only — RLS enforces this via the regular server client.
 * The endpoint streams a JSON download (Content-Disposition: attachment).
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

  // APP 12 access — two valid callers:
  //   1. Owner / partner (operational use, full access to anyone's record)
  //   2. The talent themselves accessing THEIR OWN record (self-service
  //      access right under APP 12.1; no charge per APP 12.7)
  const appUser = await getCurrentAppUser();
  if (!appUser) {
    return new Response('Forbidden', { status: 403 });
  }
  const isOwnerOrPartner = appUser.role === 'owner' || appUser.role === 'partner';
  const isSelf = appUser.role === 'talent' && appUser.talent_id === id;
  if (!isOwnerOrPartner && !isSelf) {
    return new Response('Forbidden', { status: 403 });
  }

  const supabase = await createClient();

  // Run all the queries in parallel — they're all read-only.
  const [
    { data: talent },
    { data: assignments },
    { data: feeLines },
    { data: auditEntries },
  ] = await Promise.all([
    supabase.from('atelier_talent').select('*').eq('id', id).maybeSingle(),
    supabase.from('atelier_booking_talent')
      .select('*, booking:atelier_bookings(id, booking_ref, title, state, shoot_dates, shoot_date_notes, tier, created_at)')
      .eq('talent_id', id),
    supabase.from('atelier_fee_lines').select('*').eq('talent_id', id),
    supabase.from('atelier_audit_log').select('*').eq('record_id', id).limit(500),
  ]);

  if (!talent) return new Response('Not found', { status: 404 });

  const exportPayload = {
    export_type: 'talent_full',
    export_generated_at: new Date().toISOString(),
    privacy_principle_basis: 'APP 12 (access)',
    subject: {
      kind: 'talent',
      id,
      working_name: (talent as { working_name: string }).working_name,
    },
    records: {
      talent_profile: talent,
      booking_assignments: assignments ?? [],
      fee_lines_attributed: feeLines ?? [],
      audit_log_entries: auditEntries ?? [],
    },
    counts: {
      booking_assignments: (assignments ?? []).length,
      fee_lines: (feeLines ?? []).length,
      audit_entries: (auditEntries ?? []).length,
    },
  };

  await logAudit({
    userId: await getCurrentActor(),
    action: 'data_export_talent',
    tableName: 'atelier_talent',
    recordId: id,
    newValue: { counts: exportPayload.counts },
  }).catch(() => {});

  const filename = `atelier-talent-${id.slice(0, 8)}-${Date.now()}.json`;
  return new Response(JSON.stringify(exportPayload, null, 2), {
    status: 200,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Content-Disposition': `attachment; filename="${filename}"`,
      'Cache-Control': 'no-store',
    },
  });
}
