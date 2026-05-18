/**
 * Cached read variants of the entity rosters.
 *
 * Why this file exists
 * --------------------
 * The booking detail page (and several other pages) call `listTalent()`,
 * `listCrew()`, `listClients()` on every render. Each call is a full
 * table scan against Supabase. On a tab switch — which in App Router is
 * a fresh Server Component pass — those three fetches add ~150–300 ms.
 *
 * These three datasets are:
 *   - owner/partner-only (RLS gates entry; admin pages are not personalised)
 *   - non-personal in the listing sense (every admin sees the same roster)
 *   - mutated infrequently (a few times per week at most)
 *
 * So they're an obvious fit for `unstable_cache` keyed by no args, with
 * a tag (`'entities'`) the mutation actions invalidate explicitly.
 *
 * Same shape & contract as the non-cached versions. Use the cached
 * variants for read-only listings; reach for the originals when you
 * need a fresh, post-write read.
 */

import { unstable_cache } from 'next/cache';
import { createServiceClient } from '@/lib/supabase/service';
import type { Client, Talent, Crew } from '@/lib/types/database';

const CACHE_OPTIONS = { revalidate: 120, tags: ['entities'] };

export const getCachedActiveTalent: () => Promise<Talent[]> = unstable_cache(
  async () => {
    const supabase = createServiceClient();
    const { data } = await supabase
      .from('atelier_talent')
      .select('*')
      .eq('is_active', true)
      .order('working_name');
    return (data ?? []) as Talent[];
  },
  ['entities-active-talent'],
  CACHE_OPTIONS,
);

export const getCachedActiveCrew: () => Promise<Crew[]> = unstable_cache(
  async () => {
    const supabase = createServiceClient();
    const { data } = await supabase
      .from('atelier_crew')
      .select('*')
      .eq('is_active', true)
      .order('name');
    return (data ?? []) as Crew[];
  },
  ['entities-active-crew'],
  CACHE_OPTIONS,
);

export const getCachedActiveClients: () => Promise<Client[]> = unstable_cache(
  async () => {
    const supabase = createServiceClient();
    const { data } = await supabase
      .from('atelier_clients')
      .select('*')
      .order('name');
    return (data ?? []) as Client[];
  },
  ['entities-active-clients'],
  CACHE_OPTIONS,
);
