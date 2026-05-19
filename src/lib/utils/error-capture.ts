/**
 * Error capture — write unhandled errors to atelier_error_log.
 *
 * Server-only (uses the service client to bypass RLS for inserts).
 * Designed to be a drop-in replacement target for Sentry / Datadog /
 * any external error tracker — when Atelier scales past "Jasper +
 * partners" we just swap the inner writer.
 *
 * Failure-tolerant by design: a failed capture must NEVER throw or
 * the caller's recovery path is gone. We swallow with a console.error
 * (which Vercel surfaces in function logs) so even if Supabase is
 * unreachable we still have one trail.
 *
 * Usage:
 *
 *   try {
 *     await dangerousOp();
 *   } catch (err) {
 *     captureError(err, { source: 'server_action', context: 'updateBooking', userId });
 *     throw err; // rethrow if the action should still surface to the caller
 *   }
 *
 * Or wrap an async fn with `withErrorCapture`:
 *
 *   const result = await withErrorCapture(
 *     'server_action.transitionBooking',
 *     () => transitionState(id, 'paid'),
 *     { userId, bookingId: id },
 *   );
 */

import { createServiceClient } from '@/lib/supabase/service';
import * as Sentry from '@sentry/nextjs';

export type ErrorSource =
  | 'client'
  | 'server'
  | 'edge'
  | 'cron'
  | 'server_action'
  | 'api_route';

export type ErrorCaptureContext = {
  source: ErrorSource;
  context?: string;
  userId?: string | null;
  metadata?: Record<string, unknown>;
};

const STACK_LIMIT = 2_000;
const MESSAGE_LIMIT = 500;

function truncate(value: string | null | undefined, max: number): string | null {
  if (!value) return null;
  return value.length > max ? value.slice(0, max) : value;
}

/**
 * Best-effort error coercion for the catch-clause `unknown` type.
 * Strings, Error instances, objects with a `message` field, and bare
 * primitives all get a sensible message + stack pair.
 */
function coerceError(err: unknown): { message: string; stack: string | null } {
  if (err instanceof Error) {
    return { message: err.message || 'Unknown error', stack: err.stack ?? null };
  }
  if (typeof err === 'string') return { message: err, stack: null };
  if (err && typeof err === 'object' && 'message' in err) {
    const m = (err as { message: unknown }).message;
    return { message: typeof m === 'string' ? m : JSON.stringify(m), stack: null };
  }
  try {
    return { message: JSON.stringify(err), stack: null };
  } catch {
    return { message: 'Unserialisable error', stack: null };
  }
}

/**
 * Record an error. Never throws. Returns true on success, false when
 * the write itself failed — caller should generally ignore the return
 * value and continue with their error-handling flow.
 */
export async function captureError(
  err: unknown,
  ctx: ErrorCaptureContext,
): Promise<boolean> {
  const { message, stack } = coerceError(err);

  // Always emit a structured log line first — Vercel surfaces these
  // even if the DB write below fails. Stable prefix `[error-capture]`
  // so logs can be filtered.
  console.error(
    `[error-capture] ${ctx.source}${ctx.context ? `:${ctx.context}` : ''} ${message}`,
    stack ? `\n${stack.slice(0, 1_000)}` : '',
  );

  // Forward to Sentry when DSN is configured. Inert when not. Sentry
  // capture is sync-safe — it queues the event internally and flushes
  // out-of-band, so this doesn't slow the caller's error path.
  if (process.env.NEXT_PUBLIC_SENTRY_DSN) {
    try {
      Sentry.captureException(err instanceof Error ? err : new Error(message), {
        tags: {
          source: ctx.source,
          ...(ctx.context ? { context: ctx.context } : {}),
        },
        user: ctx.userId ? { id: ctx.userId } : undefined,
        extra: ctx.metadata ?? undefined,
      });
    } catch (sentryErr) {
      // Sentry itself failing must not break the recovery path.
      console.error('[error-capture] Sentry forward failed', sentryErr);
    }
  }

  try {
    const supabase = createServiceClient();
    await supabase.from('atelier_error_log').insert({
      source: ctx.source,
      context: ctx.context ?? null,
      message: truncate(message, MESSAGE_LIMIT) ?? '(no message)',
      stack: truncate(stack, STACK_LIMIT),
      metadata: ctx.metadata ?? null,
      user_id: ctx.userId ?? null,
    });
    return true;
  } catch (writeErr) {
    console.error('[error-capture] DB write failed', writeErr);
    return false;
  }
}

/**
 * Wrap an async function with error capture. Rethrows by default so the
 * caller's existing error-handling flow continues — capture is purely
 * additive.
 *
 * Pass `swallow: true` for fire-and-forget paths where the caller
 * doesn't care whether the inner fn succeeds (e.g. background audit
 * writes, non-critical telemetry).
 */
export async function withErrorCapture<T>(
  contextLabel: string,
  fn: () => Promise<T>,
  extras: Omit<ErrorCaptureContext, 'source' | 'context'> & { source?: ErrorSource; swallow?: boolean } = {},
): Promise<T | undefined> {
  try {
    return await fn();
  } catch (err) {
    await captureError(err, {
      source: extras.source ?? 'server',
      context: contextLabel,
      userId: extras.userId ?? null,
      metadata: extras.metadata ?? undefined,
    });
    if (extras.swallow) return undefined;
    throw err;
  }
}
