import { createHash } from 'node:crypto';
import { createClient } from '@/lib/supabase/server';

const TABLE = 'atelier_idempotency_keys';
const STALE_AFTER_MS = 24 * 60 * 60 * 1000;

export function generateIdempotencyKey(
  bookingId: string, actionType: string, payloadHash: string,
): string {
  return createHash('sha256').update(`${bookingId}:${actionType}:${payloadHash}`).digest('hex');
}

export function hashPayload(payload: unknown): string {
  const json = JSON.stringify(payload, Object.keys(payload as object).sort());
  return createHash('sha256').update(json).digest('hex');
}

export type LockResult =
  | { alreadyExecuted: true; status: 'processing' | 'completed' | 'failed'; createdAt: string }
  | { alreadyExecuted: false };

export async function checkAndLock(
  key: string,
  meta: { bookingId?: string | null; actionType?: string | null } = {},
): Promise<LockResult> {
  const supabase = await createClient();
  const { data: existing, error: selectErr } = await supabase
    .from(TABLE).select('*').eq('key', key).maybeSingle();

  if (selectErr) {
    console.error('[idempotency] select failed', selectErr.message);
    return { alreadyExecuted: true, status: 'processing', createdAt: new Date().toISOString() };
  }

  if (existing) {
    const ageMs = Date.now() - new Date(existing.created_at).getTime();
    if (ageMs < STALE_AFTER_MS) {
      return { alreadyExecuted: true, status: existing.status as 'processing' | 'completed' | 'failed', createdAt: existing.created_at };
    }
    const { error: resetErr } = await supabase
      .from(TABLE).update({ status: 'processing', completed_at: null, created_at: new Date().toISOString() }).eq('key', key);
    if (resetErr) return { alreadyExecuted: true, status: 'failed', createdAt: existing.created_at };
    return { alreadyExecuted: false };
  }

  const { error: insertErr } = await supabase.from(TABLE).insert({
    key, status: 'processing',
    booking_id: meta.bookingId ?? null,
    action_type: meta.actionType ?? null,
  });

  if (insertErr) {
    if (insertErr.code === '23505') return { alreadyExecuted: true, status: 'processing', createdAt: new Date().toISOString() };
    return { alreadyExecuted: true, status: 'failed', createdAt: new Date().toISOString() };
  }
  return { alreadyExecuted: false };
}

export async function markComplete(key: string): Promise<void> {
  const supabase = await createClient();
  await supabase.from(TABLE).update({ status: 'completed', completed_at: new Date().toISOString() }).eq('key', key);
}

export async function markFailed(key: string): Promise<void> {
  const supabase = await createClient();
  await supabase.from(TABLE).update({ status: 'failed', completed_at: new Date().toISOString() }).eq('key', key);
}
