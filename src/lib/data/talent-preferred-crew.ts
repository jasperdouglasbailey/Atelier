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
