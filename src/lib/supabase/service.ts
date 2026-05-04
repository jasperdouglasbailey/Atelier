/**
 * Service-role Supabase client — bypasses RLS.
 *
 * ONLY use this in:
 *   - Vercel cron route handlers (no user session available)
 *   - Server-to-server operations that explicitly require RLS bypass
 *
 * Never expose this client to the browser or user-facing code paths.
 * Requires SUPABASE_SERVICE_ROLE_KEY in env — a secret key, not the anon key.
 */

import { createClient as createSupabaseClient } from '@supabase/supabase-js';

export function createServiceClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !serviceKey) {
    throw new Error('NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY not set');
  }

  return createSupabaseClient(url, serviceKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });
}
