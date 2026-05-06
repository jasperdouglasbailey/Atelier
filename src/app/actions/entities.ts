'use server';

import { revalidatePath } from 'next/cache';
import { createClientRecord, updateClient, createBrand } from '@/lib/data/entities';
import { createTalentRecord, updateTalent } from '@/lib/data/entities';
import { createCrewRecord, updateCrew } from '@/lib/data/entities';
import { createEntityFolder } from '@/lib/integrations/drive';
import { logAudit } from '@/lib/utils/audit';
import { getCurrentActor } from '@/lib/utils/actor';
import { reportDataError } from '@/lib/utils/data-errors';
import type { CrewTier, ArtistDiscipline, Json } from '@/lib/types/database';

/**
 * Compact entity-mutation audit log helper. Centralised so create/update
 * actions don't drift in shape — every entity write goes through here.
 */
async function auditEntityMutation(args: {
  table: 'atelier_clients' | 'atelier_talent' | 'atelier_crew' | 'atelier_brands';
  recordId: string | null;
  action: 'create' | 'update' | 'archive' | 'reactivate';
  payload?: Record<string, unknown> | null;
}): Promise<void> {
  await logAudit({
    userId: await getCurrentActor(),
    action: args.action,
    tableName: args.table,
    recordId: args.recordId,
    newValue: (args.payload ?? null) as unknown as Json,
  });
}

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
    reportDataError(`[entities] attachEntityDriveFolder(${parent}, ${entityName}) failed`, err);
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
  await auditEntityMutation({ table: 'atelier_clients', recordId: result.id, action: 'create', payload: { name: result.name } });
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
  await auditEntityMutation({ table: 'atelier_clients', recordId: id, action: 'update', payload: updates });
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
  await auditEntityMutation({ table: 'atelier_brands', recordId: result.id, action: 'create', payload: { name: result.name } });
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
  await auditEntityMutation({ table: 'atelier_talent', recordId: result.id, action: 'create', payload: { working_name: result.working_name, discipline } });
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
  await auditEntityMutation({ table: 'atelier_crew', recordId: result.id, action: 'create', payload: { name: result.name, tier: result.tier } });
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
  await auditEntityMutation({ table: 'atelier_crew', recordId: id, action: 'update', payload: updates });
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
  await auditEntityMutation({ table: 'atelier_talent', recordId: id, action: active ? 'reactivate' : 'archive' });
  revalidatePath('/talent');
  revalidatePath(`/talent/${id}`);
  return { ok: true };
}

/** Same pattern for crew. */
export async function setCrewActiveAction(id: string, active: boolean) {
  const result = await updateCrew(id, { is_active: active });
  if (!result) return { error: `Failed to ${active ? 'reactivate' : 'archive'} crew member` };
  await auditEntityMutation({ table: 'atelier_crew', recordId: id, action: active ? 'reactivate' : 'archive' });
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
  await auditEntityMutation({ table: 'atelier_talent', recordId: id, action: 'update', payload: updates });
  revalidatePath('/talent');
  revalidatePath(`/talent/${id}`);
  return { ok: true };
}
