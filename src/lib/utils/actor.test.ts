/**
 * Actor helper tests.
 *
 * The actor helper has three modes:
 *   - Dev mode (no Supabase env): returns 'jasper'
 *   - Auth configured + signed in: returns email or user.id
 *   - Auth configured + no session: returns 'system'
 *
 * The dev-mode case is testable without mocks. The other two require
 * mocking the Supabase client (see https://supabase.com/docs/guides/auth/server-side).
 * For now we lock dev mode; the others are covered by integration testing
 * once auth is live.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { getCurrentActorSync } from './actor';

describe('getCurrentActorSync', () => {
  it('returns a non-empty string', () => {
    const actor = getCurrentActorSync();
    expect(typeof actor).toBe('string');
    expect(actor.length).toBeGreaterThan(0);
  });
});

describe('getCurrentActor — dev mode (no Supabase env)', () => {
  const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const SUPABASE_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  beforeEach(() => {
    delete process.env.NEXT_PUBLIC_SUPABASE_URL;
    delete process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  });

  afterEach(() => {
    if (SUPABASE_URL) process.env.NEXT_PUBLIC_SUPABASE_URL = SUPABASE_URL;
    if (SUPABASE_KEY) process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = SUPABASE_KEY;
  });

  it("returns 'jasper' when Supabase env is unset", async () => {
    // Re-import after env mutation so the dev-mode branch is taken.
    const { getCurrentActor } = await import('./actor');
    expect(await getCurrentActor()).toBe('jasper');
  });
});
