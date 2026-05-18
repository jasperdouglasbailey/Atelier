/**
 * Lightweight server-side performance tracing.
 *
 * Wraps an async function with a high-resolution timer and emits a
 * single structured log line on completion. Output is grep-friendly
 * in Vercel function logs:
 *
 *   [perf] getBooking 47.2ms
 *   [perf] listFeeLines 112.8ms
 *   [perf] booking-detail.total 412.5ms
 *
 * No external dependency. Returns the inner value unchanged so callers
 * can drop it into existing Promise.all chains without rewriting types.
 *
 * Gated on PERF_TRACE_ENABLED env var so production isn't permanently
 * noisy. Set PERF_TRACE_ENABLED=1 on Vercel for a measurement run,
 * unset when done.
 */

const ENABLED = process.env.PERF_TRACE_ENABLED === '1';

export async function withTiming<T>(label: string, fn: () => Promise<T>): Promise<T> {
  if (!ENABLED) return fn();
  const t0 = performance.now();
  try {
    return await fn();
  } finally {
    const ms = (performance.now() - t0).toFixed(1);
    // Stable prefix so logs can be filtered server-side via `grep '\[perf\]'`.
    console.log(`[perf] ${label} ${ms}ms`);
  }
}

/**
 * Wrap a sync function — used for instrumenting compute-only hot paths
 * (computeQuoteTotals etc.) without forcing them async.
 */
export function withTimingSync<T>(label: string, fn: () => T): T {
  if (!ENABLED) return fn();
  const t0 = performance.now();
  try {
    return fn();
  } finally {
    const ms = (performance.now() - t0).toFixed(1);
    console.log(`[perf] ${label} ${ms}ms`);
  }
}
