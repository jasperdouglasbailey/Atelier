/**
 * EDMs — email marketing drafts.
 *
 * Tier 1: two templates, manual recipient paste, no list management.
 * Records live in `atelier_edms`; RLS gates the table to owner/partner.
 */

import { createClient } from '@/lib/supabase/server';
import { reportDataError } from '@/lib/utils/data-errors';
import type { Edm, EdmStatus, EdmTemplate } from '@/lib/types/database';

export async function listEdms(opts: { status?: EdmStatus } = {}): Promise<Edm[]> {
  const supabase = await createClient();
  let q = supabase.from('atelier_edms').select('*').order('updated_at', { ascending: false });
  if (opts.status) q = q.eq('status', opts.status);
  const { data, error } = await q;
  if (error) { reportDataError('[edms] list', error); return []; }
  return (data ?? []) as Edm[];
}

export async function getEdm(id: string): Promise<Edm | null> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from('atelier_edms').select('*').eq('id', id).maybeSingle();
  if (error) { reportDataError('[edms] get', error); return null; }
  return (data ?? null) as Edm | null;
}

export async function createEdm(input: {
  template: EdmTemplate;
  title: string;
}): Promise<Edm | null> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from('atelier_edms')
    .insert({ template: input.template, title: input.title })
    .select()
    .single();
  if (error) { reportDataError('[edms] create', error); return null; }
  return data as Edm;
}

export async function updateEdm(id: string, patch: {
  title?: string;
  subject?: string | null;
  preheader?: string | null;
  payload?: unknown;
  status?: EdmStatus;
  gmail_draft_id?: string | null;
  sent_at?: string | null;
}): Promise<{ ok: true } | { ok: false; error: string }> {
  const supabase = await createClient();
  const { error } = await supabase
    .from('atelier_edms')
    .update({ ...patch, updated_at: new Date().toISOString() })
    .eq('id', id);
  if (error) { reportDataError('[edms] update', error); return { ok: false, error: error.message }; }
  return { ok: true };
}

export async function deleteEdm(id: string): Promise<{ ok: true } | { ok: false; error: string }> {
  const supabase = await createClient();
  const { error } = await supabase.from('atelier_edms').delete().eq('id', id);
  if (error) { reportDataError('[edms] delete', error); return { ok: false, error: error.message }; }
  return { ok: true };
}
