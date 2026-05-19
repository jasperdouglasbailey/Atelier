import { createClient } from '@/lib/supabase/server';
import { reportDataError } from '@/lib/utils/data-errors';
import type { Client, Brand, Talent, Crew, Campaign, CrewTier, ArtistDiscipline } from '@/lib/types/database';

// ============================================================
// Clients
// ============================================================

/**
 * List clients with optional search + tag filters.
 *
 * Backward-compat: a plain string argument is still accepted and treated
 * as a search term. The object form is preferred for new callers.
 *
 * Tag filter semantics: `tags: ['agency','magazine']` returns clients
 * whose `tags` array CONTAINS ANY of the listed values (OR), not all of
 * them. Matches the locations index pattern.
 */
export async function listClients(
  opts?: string | { search?: string; tags?: string[] },
): Promise<Client[]> {
  const params: { search?: string; tags?: string[] } =
    typeof opts === 'string' ? { search: opts } : (opts ?? {});

  const supabase = await createClient();
  let query = supabase.from('atelier_clients').select('*').order('name');
  if (params.search) query = query.ilike('name', `%${params.search}%`);
  if (params.tags && params.tags.length > 0) {
    // Postgres `&&` overlap on text[]. PostgREST exposes this as `overlaps`.
    query = query.overlaps('tags', params.tags);
  }
  const { data, error } = await query;
  if (error) { reportDataError('[clients]', error); return []; }
  return (data ?? []) as Client[];
}

/**
 * Union of every tag across every client. Powers tag-filter chips on
 * the index and tag-input autocomplete on the edit form. Same shape as
 * `getAllLocationTags`.
 */
export async function getAllClientTags(): Promise<string[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from('atelier_clients')
    .select('tags')
    .not('tags', 'is', null);

  if (error) { reportDataError('[clients] all tags', error); return []; }

  const all = new Set<string>();
  for (const row of (data ?? []) as Array<{ tags: string[] | null }>) {
    for (const t of row.tags ?? []) {
      const trimmed = t.trim();
      if (trimmed) all.add(trimmed);
    }
  }
  return Array.from(all).sort((a, b) => a.localeCompare(b, 'en-AU', { sensitivity: 'base' }));
}

export async function getClient(id: string): Promise<Client | null> {
  const supabase = await createClient();
  const { data } = await supabase.from('atelier_clients').select('*').eq('id', id).maybeSingle();
  return (data as Client) ?? null;
}

export async function createClientRecord(input: {
  name: string; email?: string; phone?: string; company?: string;
  abn?: string; is_creative_agency?: boolean; parent_company_id?: string;
  payment_terms_days?: number; notes?: string; preferred_comms?: string;
}): Promise<Client | null> {
  const supabase = await createClient();
  const { data, error } = await supabase.from('atelier_clients').insert(input).select().single();
  if (error) { reportDataError('[clients] create', error); return null; }
  return data as Client;
}

export async function updateClient(id: string, updates: Partial<Client>): Promise<Client | null> {
  const supabase = await createClient();
  delete (updates as Record<string, unknown>).id;
  delete (updates as Record<string, unknown>).created_at;
  const { data, error } = await supabase.from('atelier_clients').update(updates).eq('id', id).select().single();
  if (error) { reportDataError('[clients] update', error); return null; }
  return data as Client;
}

// ============================================================
// Brands
// ============================================================

export async function listBrands(): Promise<Brand[]> {
  const supabase = await createClient();
  const { data } = await supabase.from('atelier_brands').select('*').order('name');
  return (data ?? []) as Brand[];
}

export async function createBrand(input: { name: string; industry?: string; notes?: string }): Promise<Brand | null> {
  const supabase = await createClient();
  const { data, error } = await supabase.from('atelier_brands').insert(input).select().single();
  if (error) { reportDataError('[brands] create', error); return null; }
  return data as Brand;
}

// ============================================================
// Talent
// ============================================================

export async function listTalent(opts: {
  search?: string;
  /** Filter to talent assigned to a specific agent. Migration 0069. */
  assignedAgentId?: string;
} | string = {}): Promise<Talent[]> {
  // Back-compat: callers passing a bare search string still work.
  const filters = typeof opts === 'string' ? { search: opts } : opts;
  const supabase = await createClient();
  let query = supabase.from('atelier_talent').select('*').eq('is_active', true).order('working_name');
  if (filters.search) query = query.ilike('working_name', `%${filters.search}%`);
  if (filters.assignedAgentId) {
    query = query.eq('assigned_agent_user_id', filters.assignedAgentId);
  }
  const { data } = await query;
  return (data ?? []) as Talent[];
}

export async function getTalent(id: string): Promise<Talent | null> {
  const supabase = await createClient();
  const { data } = await supabase.from('atelier_talent').select('*').eq('id', id).maybeSingle();
  return (data as Talent) ?? null;
}

export async function createTalentRecord(input: {
  legal_name: string; working_name: string;
  /** Required — what kind of creative this person is. */
  discipline: ArtistDiscipline;
  specialty?: string;
  preferred_comms?: string;
  email?: string; mobile?: string;
  pronouns?: string; abn?: string; gst_registered?: boolean; entity_type?: string;
  representation_status?: string; instagram?: string; website?: string; notes?: string;
}): Promise<Talent | null> {
  const supabase = await createClient();
  const { data, error } = await supabase.from('atelier_talent').insert(input).select().single();
  if (error) { reportDataError('[talent] create', error); return null; }
  return data as Talent;
}

export async function updateTalent(id: string, updates: Partial<Talent>): Promise<Talent | null> {
  const supabase = await createClient();
  delete (updates as Record<string, unknown>).id;
  delete (updates as Record<string, unknown>).created_at;
  const { data, error } = await supabase.from('atelier_talent').update(updates).eq('id', id).select().single();
  if (error) { reportDataError('[talent] update', error); return null; }
  return data as Talent;
}

// ============================================================
// Crew
// ============================================================

export async function listCrew(filters?: { tier?: CrewTier; search?: string; city?: string }): Promise<Crew[]> {
  const supabase = await createClient();
  let query = supabase.from('atelier_crew').select('*').eq('is_active', true).order('name');
  if (filters?.tier) query = query.eq('tier', filters.tier);
  if (filters?.city) query = query.eq('city', filters.city);
  if (filters?.search) query = query.ilike('name', `%${filters.search}%`);
  const { data } = await query;
  return (data ?? []) as Crew[];
}

/** Returns the distinct list of cities currently assigned to crew, alphabetised. */
export async function listCrewCities(): Promise<string[]> {
  const supabase = await createClient();
  const { data } = await supabase
    .from('atelier_crew')
    .select('city')
    .not('city', 'is', null);
  const cities = new Set<string>();
  for (const row of data ?? []) {
    const c = (row as { city: string | null }).city;
    if (c) cities.add(c);
  }
  return Array.from(cities).sort();
}

export async function getCrewMember(id: string): Promise<Crew | null> {
  const supabase = await createClient();
  const { data } = await supabase.from('atelier_crew').select('*').eq('id', id).maybeSingle();
  return (data as Crew) ?? null;
}

export async function createCrewRecord(input: {
  name: string; email?: string; mobile?: string; primary_role?: string;
  tier?: CrewTier; abn?: string; gst_registered?: boolean;
  default_day_rate?: number; notes?: string; preferred_comms?: string;
}): Promise<Crew | null> {
  const supabase = await createClient();
  const { data, error } = await supabase.from('atelier_crew').insert(input).select().single();
  if (error) { reportDataError('[crew] create', error); return null; }
  return data as Crew;
}

export async function updateCrew(id: string, updates: Partial<Crew>): Promise<Crew | null> {
  const supabase = await createClient();
  delete (updates as Record<string, unknown>).id;
  delete (updates as Record<string, unknown>).created_at;
  const { data, error } = await supabase.from('atelier_crew').update(updates).eq('id', id).select().single();
  if (error) { reportDataError('[crew] update', error); return null; }
  return data as Crew;
}

// ============================================================
// Campaigns
// ============================================================

export async function listCampaigns(): Promise<Campaign[]> {
  const supabase = await createClient();
  const { data } = await supabase.from('atelier_campaigns').select('*').order('created_at', { ascending: false });
  return (data ?? []) as Campaign[];
}

export async function createCampaign(input: {
  name: string; client_id?: string; brand_id?: string;
  year?: number; season?: string; notes?: string;
}): Promise<Campaign | null> {
  const supabase = await createClient();
  const { data, error } = await supabase.from('atelier_campaigns').insert(input).select().single();
  if (error) { reportDataError('[campaigns] create', error); return null; }
  return data as Campaign;
}
