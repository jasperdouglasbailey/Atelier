'use server';

import { revalidatePath } from 'next/cache';
import { createClientRecord, updateClient, createBrand } from '@/lib/data/entities';
import { createTalentRecord, updateTalent } from '@/lib/data/entities';
import { createCrewRecord, updateCrew } from '@/lib/data/entities';
import { createEntityFolder } from '@/lib/integrations/drive';
import type { CrewTier, ArtistDiscipline } from '@/lib/types/database';

/**
 * Best-effort Drive folder creation for any entity. Called after the entity
 * row is inserted. Failures are logged but never abort the create — Jasper
 * can retry from the entity detail page later.
 */
async function attachEntityDriveFolder(
  parent: 'Clients' | 'Talent' | 'Crew',
  entityId: string,
  entityName: string,
  tableName: 'atelier_clients' | 'atelier_talent' | 'atelier_crew',
): Promise<void> {
  try {
    const folder = await createEntityFolder(parent, entityName);
    if (!folder) return;

    const { createClient: createSupabase } = await import('@/lib/supabase/server');
    const supabase = await createSupabase();
    await supabase.from(tableName).update({
      drive_folder_id: folder.id,
      drive_folder_link: folder.webViewLink,
    }).eq('id', entityId);
  } catch (err) {
    console.error(`[entities] attachEntityDriveFolder(${parent}, ${entityName}) failed`, err);
  }
}

export async function createClientAction(formData: FormData) {
  const result = await createClientRecord({
    name: formData.get('name') as string,
    email: (formData.get('email') as string) || undefined,
    phone: (formData.get('phone') as string) || undefined,
    company: (formData.get('company') as string) || undefined,
    abn: (formData.get('abn') as string) || undefined,
    is_creative_agency: formData.get('is_creative_agency') === 'true',
    payment_terms_days: formData.get('payment_terms_days') ? Number(formData.get('payment_terms_days')) : undefined,
    notes: (formData.get('notes') as string) || undefined,
  });
  if (!result) return { error: 'Failed to create client' };
  // Auto-create Drive folder using the company name when present, else contact name
  const folderLabel = (formData.get('company') as string) || result.name;
  await attachEntityDriveFolder('Clients', result.id, folderLabel, 'atelier_clients');
  revalidatePath('/clients');
  return { id: result.id };
}

export async function updateClientAction(id: string, formData: FormData) {
  const updates: Record<string, unknown> = {};
  for (const [key, val] of formData.entries()) {
    if (key === 'is_creative_agency') updates[key] = val === 'true';
    else if (key === 'payment_terms_days') updates[key] = val ? Number(val) : null;
    else updates[key] = (val as string) || null;
  }
  const result = await updateClient(id, updates);
  if (!result) return { error: 'Failed to update client' };
  revalidatePath('/clients');
  revalidatePath(`/clients/${id}`);
  return { ok: true };
}

export async function createBrandAction(formData: FormData) {
  const result = await createBrand({
    name: formData.get('name') as string,
    industry: (formData.get('industry') as string) || undefined,
    notes: (formData.get('notes') as string) || undefined,
  });
  if (!result) return { error: 'Failed to create brand' };
  revalidatePath('/clients');
  return { id: result.id, name: result.name };
}

export async function createTalentAction(formData: FormData) {
  const discipline = formData.get('discipline') as ArtistDiscipline | null;
  if (!discipline) return { error: 'Discipline is required' };

  const result = await createTalentRecord({
    legal_name: formData.get('legal_name') as string,
    working_name: formData.get('working_name') as string,
    discipline,
    specialty: (formData.get('specialty') as string) || undefined,
    preferred_comms: (formData.get('preferred_comms') as string) || undefined,
    email: (formData.get('email') as string) || undefined,
    mobile: (formData.get('mobile') as string) || undefined,
    pronouns: (formData.get('pronouns') as string) || undefined,
    abn: (formData.get('abn') as string) || undefined,
    gst_registered: formData.get('gst_registered') === 'true',
    entity_type: (formData.get('entity_type') as string) || undefined,
    representation_status: (formData.get('representation_status') as string) || 'exclusive',
    instagram: (formData.get('instagram') as string) || undefined,
    website: (formData.get('website') as string) || undefined,
    notes: (formData.get('notes') as string) || undefined,
  });
  if (!result) return { error: 'Failed to create talent' };
  await attachEntityDriveFolder('Talent', result.id, result.working_name, 'atelier_talent');
  revalidatePath('/talent');
  return { id: result.id };
}

export async function createCrewAction(formData: FormData) {
  const result = await createCrewRecord({
    name: formData.get('name') as string,
    email: (formData.get('email') as string) || undefined,
    mobile: (formData.get('mobile') as string) || undefined,
    primary_role: (formData.get('primary_role') as string) || undefined,
    tier: (formData.get('tier') as CrewTier) || 'regular_freelance',
    abn: (formData.get('abn') as string) || undefined,
    gst_registered: formData.get('gst_registered') === 'true',
    default_day_rate: formData.get('default_day_rate') ? Number(formData.get('default_day_rate')) : undefined,
    notes: (formData.get('notes') as string) || undefined,
  });
  if (!result) return { error: 'Failed to create crew member' };
  await attachEntityDriveFolder('Crew', result.id, result.name, 'atelier_crew');
  revalidatePath('/crew');
  return { id: result.id };
}

export async function updateCrewAction(id: string, formData: FormData) {
  const updates: Record<string, unknown> = {};
  const textFields = ['name', 'email', 'mobile', 'preferred_comms', 'primary_role', 'tier', 'abn',
    'super_fund_name', 'super_member_number', 'super_usi', 'notes'];
  for (const f of textFields) {
    const val = formData.get(f);
    if (val !== null) updates[f] = (val as string) || null;
  }
  if (formData.get('gst_registered') !== null) {
    updates.gst_registered = formData.get('gst_registered') === 'true';
  }
  if (formData.get('default_day_rate') !== null) {
    const v = formData.get('default_day_rate') as string;
    updates.default_day_rate = v ? Number(v) : null;
  }
  const result = await updateCrew(id, updates);
  if (!result) return { error: 'Failed to update crew member' };
  revalidatePath('/crew');
  revalidatePath(`/crew/${id}`);
  return { ok: true };
}

/**
 * Soft-archive a talent: sets is_active=false. Doctrine: never hard-delete,
 * preserve audit trail. Reactivate via setTalentActiveAction(id, true).
 */
export async function setTalentActiveAction(id: string, active: boolean) {
  const result = await updateTalent(id, { is_active: active });
  if (!result) return { error: `Failed to ${active ? 'reactivate' : 'archive'} talent` };
  revalidatePath('/talent');
  revalidatePath(`/talent/${id}`);
  return { ok: true };
}

/** Same pattern for crew. */
export async function setCrewActiveAction(id: string, active: boolean) {
  const result = await updateCrew(id, { is_active: active });
  if (!result) return { error: `Failed to ${active ? 'reactivate' : 'archive'} crew member` };
  revalidatePath('/crew');
  revalidatePath(`/crew/${id}`);
  return { ok: true };
}

export async function updateTalentAction(id: string, formData: FormData) {
  const updates: Record<string, unknown> = {};
  const textFields = ['legal_name', 'working_name', 'email', 'mobile', 'pronouns',
    'discipline', 'specialty', 'preferred_comms',
    'abn', 'entity_type', 'representation_status', 'instagram', 'website', 'notes'];
  for (const f of textFields) {
    const val = formData.get(f);
    if (val !== null) updates[f] = (val as string) || null;
  }
  if (formData.get('gst_registered') !== null) {
    updates.gst_registered = formData.get('gst_registered') === 'true';
  }
  const result = await updateTalent(id, updates);
  if (!result) return { error: 'Failed to update talent' };
  revalidatePath('/talent');
  revalidatePath(`/talent/${id}`);
  return { ok: true };
}
