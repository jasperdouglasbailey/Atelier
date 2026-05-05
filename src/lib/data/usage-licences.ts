import { createClient } from '@/lib/supabase/server';
import { reportDataError } from '@/lib/utils/data-errors';
import type { UsageLicence, UsageMedia, UsageTerritory } from '@/lib/types/database';
import { logAudit } from '@/lib/utils/audit';
import { getCurrentActor } from '@/lib/utils/actor';

const TABLE = 'atelier_usage_licences';

export async function listUsageLicences(bookingId: string): Promise<UsageLicence[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from(TABLE)
    .select('*')
    .eq('booking_id', bookingId)
    .order('created_at', { ascending: true });

  if (error) { reportDataError('[usage] list', error); return []; }
  return (data ?? []) as UsageLicence[];
}

export type CreateUsageLicenceInput = {
  booking_id: string;
  talent_id?: string | null;
  media: UsageMedia[];
  territory: UsageTerritory[];
  duration_months: number;
  start_date?: string | null;
  end_date?: string | null;
  bur_multiplier?: number | null;
  fee: number;
  notes?: string | null;
};

export async function addUsageLicence(input: CreateUsageLicenceInput): Promise<UsageLicence | null> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from(TABLE)
    .insert(input)
    .select()
    .single();

  if (error) { reportDataError('[usage] create', error); return null; }

  await logAudit({
    userId: await getCurrentActor(),
    action: 'add_usage_licence',
    tableName: TABLE,
    recordId: (data as UsageLicence).id,
    newValue: { media: input.media.join(','), territory: input.territory.join(','), fee: String(input.fee) },
  });

  return data as UsageLicence;
}

export async function removeUsageLicence(id: string): Promise<boolean> {
  const supabase = await createClient();
  const { error } = await supabase.from(TABLE).delete().eq('id', id);
  if (error) { reportDataError('[usage] remove', error); return false; }

  await logAudit({
    userId: await getCurrentActor(),
    action: 'remove_usage_licence',
    tableName: TABLE,
    recordId: id,
  });

  return true;
}
