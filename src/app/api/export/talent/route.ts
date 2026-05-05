import { createClient } from '@/lib/supabase/server';
import { buildCsv } from '@/lib/utils/csv';

export const dynamic = 'force-dynamic';

const HEADERS = [
  'working_name', 'legal_name', 'discipline', 'specialty',
  'email', 'mobile', 'instagram', 'website',
  'abn', 'gst_registered', 'entity_type',
  'representation_status', 'default_day_rate',
  'is_active', 'notes',
];

export async function GET() {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from('atelier_talent')
    .select('working_name,legal_name,discipline,specialty,email,mobile,instagram,website,abn,gst_registered,entity_type,representation_status,default_day_rate,is_active,notes')
    .order('working_name');

  if (error) {
    return new Response('Export failed', { status: 500 });
  }

  const rows = (data ?? []).map((t) => [
    t.working_name, t.legal_name, t.discipline, t.specialty,
    t.email, t.mobile, t.instagram, t.website,
    t.abn, t.gst_registered ? 'yes' : 'no', t.entity_type,
    t.representation_status, t.default_day_rate,
    t.is_active ? 'yes' : 'no', t.notes,
  ]);

  const csv = buildCsv(HEADERS, rows);
  const filename = `atelier-talent-${new Date().toISOString().slice(0, 10)}.csv`;

  return new Response(csv, {
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="${filename}"`,
    },
  });
}
