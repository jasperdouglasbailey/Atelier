import { createHash } from 'node:crypto';
import { createClient } from '@/lib/supabase/server';

const STALE_AFTER_MS = 24 * 60 * 60 * 1000;

/**
 * Deterministic key from (booking, action, payload). Same inputs always
 * produce the same key, so a retry with identical payload is detected.
 */
export function generateIdempotencyKey(
  bookingId: string,
  actionType: string,
  payloadHash: string,
): string {
  const raw = `${bookingId}:${actionType}:${payloadHash}`;
  return createHash('sha256').update(raw).digest('hex');
}

/** Convenience: hash an arbitrary payload object for use as the third arg above. */
export function hashPayload(payload: unknown): string {
  const json = JSON.stringify(payload, Object.keys(payload as object).sort());
  return createHash('sha256').update(json).digest('hex');
}

export type LockResult =
  | { alreadyExecuted: true; status: 'processing' | 'completed' | 'failed'; createdAt: string }
  | { alreadyExecuted: false };

/**
 * Atomically claim an idempotency key.
 *
 *   - Fresh row exists (<24h)  → already executed; caller skips.
 *   - Stale row exists (>=24h) → row is bumped back to 'processing' and
 *                                caller proceeds (treated as new attempt).
 *   - No row                   → new row inserted as 'processing'; proceed.
 */
export async function checkAndLock(
  key: string,
  meta: { bookingId?: string | null; actionType?: string | null } = {},
): Promise<LockResult> {
  const supabase = await createClient();

  const { data: existing, error: selectErr } = await supabase
    .from('idempotency_keys')
    .select('*')
    .eq('key', key)
    .maybeSingle();

  if (selectErr) {
    console.error('[idempotency] select failed', selectErr.message);
    // Fail closed: pretend it's locked so we don't double-fire on a flaky DB.
    return { alreadyExecuted: true, status: 'processing', createdAt: new Date().toISOString() };
  }

  if (existing) {
    const ageMs = Date.now() - new Date(existing.created_at).getTime();
    if (ageMs < STALE_AFTER_MS) {
      return {
        alreadyExecuted: true,
        status: existing.status as 'processing' | 'completed' | 'failed',
        createdAt: existing.created_at,
      };
    }

    // Stale — reset and let caller re-execute.
    const { error: resetErr } = await supabase
      .from('idempotency_keys')
      .update({
        status: 'processing',
        completed_at: null,
        created_at: new Date().toISOString(),
      })
      .eq('key', key);

    if (resetErr) {
      console.error('[idempotency] reset failed', resetErr.message);
      return { alreadyExecuted: true, status: 'failed', createdAt: existing.created_at };
    }
    return { alreadyExecuted: false };
  }

  const { error: insertErr } = await supabase.from('idempotency_keys').insert({
    key,
    status: 'processing',
    booking_id: meta.bookingId ?? null,
    action_type: meta.actionType ?? null,
  });

  if (insertErr) {
    // Could be a race — another request inserted the same key. Treat as locked.
    if (insertErr.code === '23505') {
      return { alreadyExecuted: true, status: 'processing', createdAt: new Date().toISOString() };
    }
    console.error('[idempotency] insert failed', insertErr.message);
    return { alreadyExecuted: true, status: 'failed', createdAt: new Date().toISOString() };
  }

  return { alreadyExecuted: false };
}

export async function markComplete(key: string): Promise<void> {
  const supabase = await createClient();
  const { error } = await supabase
    .from('idempotency_keys')
    .update({ status: 'completed', completed_at: new Date().toISOString() })
    .eq('key', key);
  if (error) console.error('[idempotency] markComplete failed', error.message);
}

export async function markFailed(key: string): Promise<void> {
  const supabase = await createClient();
  const { error } = await supabase
    .from('idempotency_keys')
    .update({ status: 'failed', completed_at: new Date().toISOString() })
    .eq('key', key);
  if (error) console.error('[idempotency] markFailed failed', error.message);
}
