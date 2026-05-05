import { createClient } from '@/lib/supabase/server';
import { reportDataError } from '@/lib/utils/data-errors';
import type { Location, StudioType } from '@/lib/types/database';

const TABLE = 'atelier_locations';

export async function listLocations(filters?: { search?: string; studio_type?: StudioType; active_only?: boolean }): Promise<Location[]> {
  const supabase = await createClient();
  let q = supabase.from(TABLE).select('*').order('name');
  if (filters?.active_only ?? true) q = q.eq('is_active', true);
  if (filters?.studio_type) q = q.eq('studio_type', filters.studio_type);
  if (filters?.search) {
    q = q.or(`name.ilike.%${filters.search}%,suburb.ilike.%${filters.search}%,alias.ilike.%${filters.search}%`);
  }
  const { data, error } = await q;
  if (error) { reportDataError('[locations] list', error); return []; }
  return (data ?? []) as Location[];
}

export async function getLocation(id: string): Promise<Location | null> {
  const supabase = await createClient();
  const { data } = await supabase.from(TABLE).select('*').eq('id', id).maybeSingle();
  return (data as Location) ?? null;
}

export async function createLocation(input: Partial<Omit<Location, 'id' | 'created_at' | 'updated_at'>> & { name: string }): Promise<Location | null> {
  const supabase = await createClient();
  const { data, error } = await supabase.from(TABLE).insert(input).select().single();
  if (error) { reportDataError('[locations] create', error); return null; }
  return data as Location;
}

export async function updateLocation(id: string, updates: Partial<Omit<Location, 'id' | 'created_at'>>): Promise<Location | null> {
  const supabase = await createClient();
  const { data, error } = await supabase.from(TABLE).update(updates).eq('id', id).select().single();
  if (error) { reportDataError('[locations] update', error); return null; }
  return data as Location;
}
