/**
 * Bulk talent CSV export — owner/partner only.
 *
 * Returns all talent as a CSV with all columns including those added
 * in migration 0020 (city, dietary, drink_order, etc.).
 * Used as a convenience export for roster management.
 *
 * For per-entity full JSON export (APP 12), see /api/export/talent/[id].
 */

import { getCurrentAppUser } from '@/lib/data/app-users';
import { createClient } from '@/lib/supabase/server';
import { buildCsv } from '@/lib/utils/csv';
import type { Talent } from '@/lib/types/database';

export const dynamic = 'force-dynamic';

const HEADERS = [
  'working_name', 'legal_name', 'discipline', 'specialty',
  'pronouns', 'preferred_comms',
  'email', 'mobile', 'city', 'home_address', 'dob',
  'dietary', 'drink_order',
  'instagram', 'website',
  'abn', 'gst_registered', 'entity_type', 'representation_status',
  'work_rights',
  'super_fund_name', 'super_member_number', 'super_usi',
  'default_day_rate',
  'is_active', 'onboarding_completed',
  'notes',
];

export async function GET() {
  const appUser = await getCurrentAppUser();
  if (!appUser || (appUser.role !== 'owner' && appUser.role !== 'partner')) {
    return new Response('Forbidden', { status: 403 });
  }

  const supabase = await createClient();
  const { data, error } = await supabase
    .from('atelier_talent')
    .select('*')
    .order('working_name');

  if (error) {
    return new Response('Export failed', { status: 500 });
  }

  const rows = (data as unknown as Talent[] ?? []).map((t) => [
    t.working_name,
    t.legal_name,
    t.discipline,
    t.specialty,
    t.pronouns,
    t.preferred_comms,
    t.email,
    t.mobile,
    t.city,
    t.home_address,
    t.dob,
    t.dietary,
    t.drink_order,
    t.instagram,
    t.website,
    t.abn,
    t.gst_registered ? 'yes' : 'no',
    t.entity_type,
    t.representation_status,
    t.work_rights,
    t.super_fund_name,
    t.super_member_number,
    t.super_usi,
    t.default_day_rate,
    t.is_active ? 'yes' : 'no',
    t.onboarding_completed ? 'yes' : 'no',
    t.notes,
  ]);

  const csv = buildCsv(HEADERS, rows);
  const filename = `atelier-talent-${new Date().toISOString().slice(0, 10)}.csv`;

  return new Response(csv, {
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="${filename}"`,
      'Cache-Control': 'no-store',
    },
  });
}
