'use server';

import { revalidatePath } from 'next/cache';
import { createClientRecord, updateClient, createBrand } from '@/lib/data/entities';
import { createTalentRecord, updateTalent } from '@/lib/data/entities';
import { createCrewRecord, updateCrew } from '@/lib/data/entities';
import type { CrewTier, ArtistDiscipline } from '@/lib/types/database';

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
