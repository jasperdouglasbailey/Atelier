/**
 * Bulk crew CSV export — owner/partner only.
 *
 * Returns all active crew as a CSV with all columns including those
 * added in migration 0020 (city, dietary, drink_order, etc.).
 * Used as a convenience export for roster management.
 *
 * For per-entity full JSON export (APP 12), see /api/export/crew/[id].
 */

import { getCurrentAppUser } from '@/lib/data/app-users';
import { createClient } from '@/lib/supabase/server';
import { buildCsv } from '@/lib/utils/csv';
import type { Crew } from '@/lib/types/database';

export const dynamic = 'force-dynamic';

const HEADERS = [
  'name', 'email', 'mobile', 'preferred_comms',
  'primary_role', 'secondary_roles', 'tier',
  'city', 'home_address', 'dob',
  'dietary', 'drink_order',
  'abn', 'gst_registered',
  'super_fund_name', 'super_member_number', 'super_usi',
  'default_day_rate', 'kit_list', 'certifications',
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
    .from('atelier_crew')
    .select('*')
    .order('name');

  if (error) {
    return new Response('Export failed', { status: 500 });
  }

  const rows = (data as unknown as Crew[] ?? []).map((c) => [
    c.name,
    c.email,
    c.mobile,
    c.preferred_comms,
    c.primary_role,
    Array.isArray(c.secondary_roles) ? c.secondary_roles.join(' | ') : '',
    c.tier,
    c.city,
    c.home_address,
    c.dob,
    c.dietary,
    c.drink_order,
    c.abn,
    c.gst_registered ? 'yes' : 'no',
    c.super_fund_name,
    c.super_member_number,
    c.super_usi,
    c.default_day_rate,
    c.kit_list,
    Array.isArray(c.certifications) ? c.certifications.join(' | ') : '',
    c.is_active ? 'yes' : 'no',
    c.onboarding_completed ? 'yes' : 'no',
    c.notes,
  ]);

  const csv = buildCsv(HEADERS, rows);
  const filename = `atelier-crew-${new Date().toISOString().slice(0, 10)}.csv`;

  return new Response(csv, {
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="${filename}"`,
      'Cache-Control': 'no-store',
    },
  });
}
