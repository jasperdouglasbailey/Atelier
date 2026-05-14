/**
 * Auto-anonymise cron — Australian Privacy Principle 11.2.
 *
 * APP 11.2: where personal information is no longer needed, take reasonable
 * steps to destroy it or de-identify it.
 *
 * The ATO requires Australian businesses to keep financial records for 7
 * years. After that there's no business reason (and no legal basis) to
 * retain personal details on talent, crew, or clients we haven't worked
 * with for that long. This cron sweeps the three person tables daily and
 * anonymises any inactive record (`is_active = false`) whose most recent
 * booking finished more than 7 years ago — or, if there are no bookings
 * at all, whose record was created more than 7 years ago.
 *
 * Already-anonymised records are skipped (working_name / name starting
 * with "Anonymised " is the marker).
 *
 * Runs daily at 04:15 UTC. Idempotent — re-running on the same day is a
 * no-op for already-anonymised rows.
 */

import { NextRequest, NextResponse } from 'next/server';
import { isCronAuthorised } from '@/lib/utils/cron-auth';
import { createServiceClient } from '@/lib/supabase/service';
import { logAudit } from '@/lib/utils/audit';
import { trashDriveFolder } from '@/lib/integrations/drive';

export const dynamic = 'force-dynamic';

const SEVEN_YEARS_MS = 7 * 365 * 24 * 60 * 60 * 1000;
const ANON_PREFIX = 'Anonymised ';

function randomAnonId(): string {
  // 8 alphanumeric chars — same shape as the manual anonymise actions use.
  return Math.random().toString(36).slice(2, 10);
}

interface SweepResult {
  scanned: number;
  anonymised: number;
  errors: number;
}

export async function GET(req: NextRequest) {
  if (!isCronAuthorised(req, 'AUTO_ANONYMISE')) {
    return new NextResponse('Unauthorised', { status: 401 });
  }

  await logAudit({ userId: null, action: 'cron_auto_anonymise_run', tableName: 'atelier_audit_log', newValue: { startedAt: new Date().toISOString() } }).catch(() => {});

  const cutoffIso = new Date(Date.now() - SEVEN_YEARS_MS).toISOString();
  const supabase = createServiceClient();

  const [talent, crew, client] = await Promise.all([
    sweepTable(supabase, 'atelier_talent', 'working_name', cutoffIso, 'talent'),
    sweepTable(supabase, 'atelier_crew', 'name', cutoffIso, 'crew'),
    sweepTable(supabase, 'atelier_clients', 'name', cutoffIso, 'client'),
  ]);

  const summary = {
    talent: { ...talent },
    crew: { ...crew },
    client: { ...client },
  };

  await logAudit({
    userId: null,
    action: 'cron_auto_anonymise',
    tableName: 'atelier_audit_log',
    recordId: null,
    newValue: summary as unknown as Record<string, never>,
  }).catch(() => {});

  return NextResponse.json({ ok: true, ...summary });
}

/**
 * Sweep a single person table. Marker logic:
 *   - is_active = false (only inactive records get anonymised)
 *   - name not already starting with "Anonymised "
 *   - last booking shoot date < cutoff (7 years ago)
 *     OR no bookings AND created_at < cutoff
 */
async function sweepTable(
  supabase: ReturnType<typeof createServiceClient>,
  table: 'atelier_talent' | 'atelier_crew' | 'atelier_clients',
  nameField: 'working_name' | 'name',
  cutoffIso: string,
  kind: 'talent' | 'crew' | 'client',
): Promise<SweepResult> {
  const result: SweepResult = { scanned: 0, anonymised: 0, errors: 0 };

  // Step 1: candidate rows. Inactive, not already anonymised, created
  // before cutoff. We further filter by booking history per row below.
  const { data: candidates, error } = await supabase
    .from(table)
    .select('id, ' + nameField + ', drive_folder_id, created_at')
    .eq('is_active', false)
    .not(nameField, 'ilike', `${ANON_PREFIX}%`)
    .lt('created_at', cutoffIso);

  if (error || !candidates) {
    result.errors++;
    return result;
  }

  result.scanned = candidates.length;

  for (const row of candidates as unknown as Array<Record<string, unknown>>) {
    const id = row.id as string;
    const name = row[nameField] as string;
    const driveFolderId = (row.drive_folder_id as string) ?? null;

    // Has this person been on any booking whose shoot finished after the
    // cutoff? If so, we must keep their details for ATO records.
    const recent = await hasRecentBooking(supabase, kind, id, cutoffIso);
    if (recent) continue;

    // Anonymise. Same field-zeroing pattern as the manual actions.
    const anonId = randomAnonId();
    const updates = buildAnonUpdate(table, anonId);

    const { error: updateError } = await supabase
      .from(table)
      .update(updates)
      .eq('id', id);

    if (updateError) {
      result.errors++;
      continue;
    }

    await trashDriveFolder(driveFolderId).catch(() => false);

    await logAudit({
      userId: null,
      action: 'auto_anonymise_7y',
      tableName: table,
      recordId: id,
      oldValue: { name },
      newValue: { anon_id: anonId, reason: 'app_11_2_retention_7yr' },
    }).catch(() => {});

    result.anonymised++;
  }

  return result;
}

async function hasRecentBooking(
  supabase: ReturnType<typeof createServiceClient>,
  kind: 'talent' | 'crew' | 'client',
  id: string,
  cutoffIso: string,
): Promise<boolean> {
  const cutoffYmd = cutoffIso.slice(0, 10); // YYYY-MM-DD for shoot_dates compare

  if (kind === 'client') {
    // Clients: any non-cancelled booking with created_at past cutoff is fresh.
    const { count } = await supabase
      .from('atelier_bookings')
      .select('id', { count: 'exact', head: true })
      .eq('client_id', id)
      .gt('created_at', cutoffIso);
    return (count ?? 0) > 0;
  }

  // Talent / crew: any join row to a booking whose shoot end is past cutoff.
  // Postgres daterange `&>` would be ideal but PostgREST doesn't expose it;
  // we approximate via `shoot_dates::text > cutoff` which works because the
  // serialised range starts with the lower bound (earliest possible shoot
  // date in the row).
  const joinTable = kind === 'talent' ? 'atelier_booking_talent' : 'atelier_booking_crew';
  const idField = kind === 'talent' ? 'talent_id' : 'crew_id';

  const { data } = await supabase
    .from(joinTable)
    .select(`booking:atelier_bookings(shoot_dates, created_at)`)
    .eq(idField, id);

  for (const row of (data ?? []) as unknown as Array<{ booking: { shoot_dates: string | null; created_at: string } | null }>) {
    if (!row.booking) continue;
    if (row.booking.created_at > cutoffIso) return true;
    // shoot_dates check — recent shoot wins even if booking row was old
    if (row.booking.shoot_dates) {
      const m = row.booking.shoot_dates.match(/[\[(]([\d-]+),([\d-]+)?[\])]/);
      if (m && m[1] && m[1] > cutoffYmd) return true;
    }
  }
  return false;
}

function buildAnonUpdate(
  table: 'atelier_talent' | 'atelier_crew' | 'atelier_clients',
  anonId: string,
): Record<string, unknown> {
  const label = `${ANON_PREFIX}${anonId}`;
  const common = {
    email: null, mobile: null, abn: null, notes: null,
    drive_folder_id: null, drive_folder_link: null,
  };
  if (table === 'atelier_talent') {
    return {
      ...common,
      working_name: label, legal_name: label,
      pronouns: null, dob: null, home_address: null, dietary: null, drink_order: null,
      emergency_name: null, emergency_relationship: null, emergency_mobile: null,
      super_fund_name: null, super_member_number: null, super_usi: null,
      instagram: null, website: null, xero_contact_id: null,
      onboarding_token: null, onboarding_token_expires_at: null,
      onboarding_completed: false,
    };
  }
  if (table === 'atelier_crew') {
    return {
      ...common,
      name: label,
      preferred_comms: null, city: null, dob: null, home_address: null,
      dietary: null, drink_order: null,
      super_fund_name: null, super_member_number: null, super_usi: null,
      xero_contact_id: null,
      onboarding_token: null, onboarding_token_expires_at: null,
      onboarding_completed: false,
    };
  }
  // Clients
  return {
    ...common,
    name: label, company: null,
  };
}
