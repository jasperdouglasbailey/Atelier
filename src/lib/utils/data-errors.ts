/**
 * Loud failures in dev, graceful fallback in prod.
 *
 * The data layer wraps every Supabase call in `if (error) { console.error(...); return [] }`
 * — that's the right behaviour in production (one stale section beats a 500
 * page) but it hides schema drift like the working_name → atelier_talent.name
 * mismatch we shipped in error. In dev/preview we want those failures to
 * SCREAM so they get caught before they reach prod.
 *
 * Use as a drop-in replacement for the inline `console.error(...)` pattern:
 *
 *   if (error) {
 *     reportDataError('[bookings] list', error);
 *     return [];
 *   }
 *
 * In `process.env.NODE_ENV === 'production'` the function logs and returns,
 * so the caller still hits its `return []` fallback. In dev/preview/test it
 * THROWS the underlying error, which Next.js turns into the overlay/error
 * boundary and CI flags as a failed render.
 *
 * Vercel sets NODE_ENV=production for production builds and NODE_ENV=development
 * for `next dev` / preview deploys (preview is treated as production by Vercel
 * but the env flag we use here is the runtime one — preview deploys have it set
 * to 'production' too, so they keep the graceful path. That's intentional —
 * preview should mirror prod behaviour. Local `next dev` is where this fires.)
 */

type SupabaseLikeError = { message?: string; code?: string; details?: string; hint?: string };

export function reportDataError(scope: string, error: unknown): void {
  // Always log so the server log is searchable.
  const msg = formatError(error);
  console.error(`${scope} ${msg}`);

  // In dev, escalate to a thrown error so Next's overlay shows it.
  if (process.env.NODE_ENV !== 'production') {
    if (error instanceof Error) throw error;
    throw new Error(`${scope} ${msg}`);
  }
}

function formatError(error: unknown): string {
  if (error == null) return '(no detail)';
  if (typeof error === 'string') return error;
  if (error instanceof Error) return error.message;
  const e = error as SupabaseLikeError;
  const parts = [e.message, e.code, e.details, e.hint].filter(Boolean);
  return parts.length > 0 ? parts.join(' · ') : JSON.stringify(error);
}
