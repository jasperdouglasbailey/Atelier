import { createClient } from '@/lib/supabase/server';
import { buildCsv } from '@/lib/utils/csv';

export const dynamic = 'force-dynamic';

const HEADERS = [
  'name', 'email', 'mobile', 'primary_role', 'tier',
  'abn', 'gst_registered', 'default_day_rate', 'is_active', 'notes',
];

export async function GET() {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from('atelier_crew')
    .select('name,email,mobile,primary_role,tier,abn,gst_registered,default_day_rate,is_active,notes')
    .order('name');

  if (error) {
    return new Response('Export failed', { status: 500 });
  }

  const rows = (data ?? []).map((c) => [
    c.name, c.email, c.mobile, c.primary_role, c.tier,
    c.abn, c.gst_registered ? 'yes' : 'no', c.default_day_rate,
    c.is_active ? 'yes' : 'no', c.notes,
  ]);

  const csv = buildCsv(HEADERS, rows);
  const filename = `atelier-crew-${new Date().toISOString().slice(0, 10)}.csv`;

  return new Response(csv, {
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="${filename}"`,
    },
  });
}
