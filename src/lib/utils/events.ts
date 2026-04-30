import { createClient } from '@/lib/supabase/server';
import type { Json, AtelierEvent } from '@/lib/types/database';

const TABLE = 'atelier_events';

export async function emitEvent(
  eventType: string,
  payload: Json = {},
  options: { bookingId?: string | null; actor?: string | null; idempotencyKey?: string | null } = {},
): Promise<void> {
  try {
    const supabase = await createClient();
    const { error } = await supabase.from(TABLE).insert({
      event_type: eventType,
      payload,
      booking_id: options.bookingId ?? null,
      actor: options.actor ?? null,
      idempotency_key: options.idempotencyKey ?? null,
    });
    if (error) console.error('[events] insert failed', error.message);
  } catch (err) {
    console.error('[events] threw', err);
  }
}

export async function listEvents(options: {
  bookingId?: string;
  eventType?: string;
  limit?: number;
} = {}): Promise<AtelierEvent[]> {
  const supabase = await createClient();
  let query = supabase
    .from(TABLE)
    .select('*')
    .order('created_at', { ascending: false })
    .limit(options.limit ?? 50);

  if (options.bookingId) query = query.eq('booking_id', options.bookingId);
  if (options.eventType) query = query.eq('event_type', options.eventType);

  const { data, error } = await query;
  if (error) {
    console.error('[events] list failed', error.message);
    return [];
  }
  return (data ?? []) as AtelierEvent[];
}
