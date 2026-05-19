import { createClient } from '@/lib/supabase/server';
import type { Crew } from '@/lib/types/database';

export type TalentPreferredCrewRow = {
  id: string;
  talent_id: string;
  crew_id: string;
  role_hint: string | null;
  sort_order: number;
  notes: string | null;
  created_at: string;
  /** Joined crew record (when requested). */
  crew?: Crew;
};

/**
 * Returns the preferred-crew list for a single talent, ordered by
 * sort_order then created_at, with the joined crew record so the UI
 * can render name/role/city without a second fetch.
 */
export async function listPreferredCrew(talentId: string): Promise<TalentPreferredCrewRow[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from('atelier_talent_preferred_crew')
    .select('*, crew:atelier_crew(*)')
    .eq('talent_id', talentId)
    .order('sort_order', { ascending: true })
    .order('created_at', { ascending: true });
  if (error || !data) return [];
  return data as unknown as TalentPreferredCrewRow[];
}

/**
 * Returns just the crew IDs preferred by a talent — used when we need to
 * surface "Oliver's preferred crew" at the top of the BookingTeam picker
 * without rendering the relationship rows themselves.
 */
export async function listPreferredCrewIds(talentId: string): Promise<string[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from('atelier_talent_preferred_crew')
    .select('crew_id')
    .eq('talent_id', talentId);
  if (error || !data) return [];
  return (data as { crew_id: string }[]).map((r) => r.crew_id);
}

/**
 * Multi-talent variant — returns the UNION of preferred crew IDs across
 * a set of talents, deduped. Used when a booking has multiple artists
 * attached and we want to surface "preferred by anyone on the team"
 * at the top of the BookingTeam crew picker.
 *
 * Returns IDs only (not full rows) — keeps the payload small for the
 * common case (just "is this crew member someone's favourite?").
 * Empty input → empty result.
 */
export async function listPreferredCrewIdsForTalents(
  talentIds: string[],
): Promise<string[]> {
  if (talentIds.length === 0) return [];
  const supabase = await createClient();
  const { data, error } = await supabase
    .from('atelier_talent_preferred_crew')
    .select('crew_id')
    .in('talent_id', talentIds);
  if (error || !data) return [];
  // De-dupe — crew member X could be preferred by multiple artists on
  // the same booking. Insert order preserved for deterministic UI.
  const seen = new Set<string>();
  const out: string[] = [];
  for (const r of data as { crew_id: string }[]) {
    if (seen.has(r.crew_id)) continue;
    seen.add(r.crew_id);
    out.push(r.crew_id);
  }
  return out;
}

export async function addPreferredCrew(input: {
  talentId: string;
  crewId: string;
  roleHint?: string | null;
  notes?: string | null;
}): Promise<{ id: string } | null> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from('atelier_talent_preferred_crew')
    .insert({
      talent_id: input.talentId,
      crew_id: input.crewId,
      role_hint: input.roleHint ?? null,
      notes: input.notes ?? null,
    })
    .select('id')
    .single();
  if (error || !data) return null;
  return { id: data.id as string };
}

export async function removePreferredCrew(id: string): Promise<boolean> {
  const supabase = await createClient();
  const { error } = await supabase
    .from('atelier_talent_preferred_crew')
    .delete()
    .eq('id', id);
  return !error;
}
