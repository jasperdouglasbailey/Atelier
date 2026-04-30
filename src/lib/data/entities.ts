import { createClient } from '@/lib/supabase/server';
import type { Client, Brand, Talent, Crew, Campaign, CrewTier } from '@/lib/types/database';

// ============================================================
// Clients
// ============================================================

export async function listClients(search?: string): Promise<Client[]> {
  const supabase = await createClient();
  let query = supabase.from('atelier_clients').select('*').order('name');
  if (search) query = query.ilike('name', `%${search}%`);
  const { data, error } = await query;
  if (error) { console.error('[clients]', error.message); return []; }
  return (data ?? []) as Client[];
}

export async function getClient(id: string): Promise<Client | null> {
  const supabase = await createClient();
  const { data } = await supabase.from('atelier_clients').select('*').eq('id', id).maybeSingle();
  return (data as Client) ?? null;
}

export async function createClientRecord(input: {
  name: string; email?: string; phone?: string; company?: string;
  abn?: string; is_creative_agency?: boolean; parent_company_id?: string;
  payment_terms_days?: number; notes?: string;
}): Promise<Client | null> {
  const supabase = await createClient();
  const { data, error } = await supabase.from('atelier_clients').insert(input).select().single();
  if (error) { console.error('[clients] create', error.message); return null; }
  return data as Client;
}

export async function updateClient(id: string, updates: Partial<Client>): Promise<Client | null> {
  const supabase = await createClient();
  delete (updates as Record<string, unknown>).id;
  delete (updates as Record<string, unknown>).created_at;
  const { data, error } = await supabase.from('atelier_clients').update(updates).eq('id', id).select().single();
  if (error) { console.error('[clients] update', error.message); return null; }
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
  if (error) { console.error('[brands] create', error.message); return null; }
  return data as Brand;
}

// ============================================================
// Talent
// ============================================================

export async function listTalent(search?: string): Promise<Talent[]> {
  const supabase = await createClient();
  let query = supabase.from('atelier_talent').select('*').order('working_name');
  if (search) query = query.ilike('working_name', `%${search}%`);
  const { data } = await query;
  return (data ?? []) as Talent[];
}

export async function getTalent(id: string): Promise<Talent | null> {
  const supabase = await createClient();
  const { data } = await supabase.from('atelier_talent').select('*').eq('id', id).maybeSingle();
  return (data as Talent) ?? null;
}

export async function createTalentRecord(input: {
  legal_name: string; working_name: string; email?: string; mobile?: string;
  pronouns?: string; abn?: string; gst_registered?: boolean; entity_type?: string;
  representation_status?: string; instagram?: string; website?: string; notes?: string;
}): Promise<Talent | null> {
  const supabase = await createClient();
  const { data, error } = await supabase.from('atelier_talent').insert(input).select().single();
  if (error) { console.error('[talent] create', error.message); return null; }
  return data as Talent;
}

export async function updateTalent(id: string, updates: Partial<Talent>): Promise<Talent | null> {
  const supabase = await createClient();
  delete (updates as Record<string, unknown>).id;
  delete (updates as Record<string, unknown>).created_at;
  const { data, error } = await supabase.from('atelier_talent').update(updates).eq('id', id).select().single();
  if (error) { console.error('[talent] update', error.message); return null; }
  return data as Talent;
}

// ============================================================
// Crew
// ============================================================

export async function listCrew(filters?: { tier?: CrewTier; search?: string }): Promise<Crew[]> {
  const supabase = await createClient();
  let query = supabase.from('atelier_crew').select('*').order('name');
  if (filters?.tier) query = query.eq('tier', filters.tier);
  if (filters?.search) query = query.ilike('name', `%${filters.search}%`);
  const { data } = await query;
  return (data ?? []) as Crew[];
}

export async function getCrewMember(id: string): Promise<Crew | null> {
  const supabase = await createClient();
  const { data } = await supabase.from('atelier_crew').select('*').eq('id', id).maybeSingle();
  return (data as Crew) ?? null;
}

export async function createCrewRecord(input: {
  name: string; email?: string; mobile?: string; primary_role?: string;
  tier?: CrewTier; abn?: string; gst_registered?: boolean;
  default_day_rate?: number; notes?: string;
}): Promise<Crew | null> {
  const supabase = await createClient();
  const { data, error } = await supabase.from('atelier_crew').insert(input).select().single();
  if (error) { console.error('[crew] create', error.message); return null; }
  return data as Crew;
}

export async function updateCrew(id: string, updates: Partial<Crew>): Promise<Crew | null> {
  const supabase = await createClient();
  delete (updates as Record<string, unknown>).id;
  delete (updates as Record<string, unknown>).created_at;
  const { data, error } = await supabase.from('atelier_crew').update(updates).eq('id', id).select().single();
  if (error) { console.error('[crew] update', error.message); return null; }
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
  if (error) { console.error('[campaigns] create', error.message); return null; }
  return data as Campaign;
}
