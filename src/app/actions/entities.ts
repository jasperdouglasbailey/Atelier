'use server';

import { revalidatePath } from 'next/cache';
import { createClientRecord, updateClient } from '@/lib/data/entities';
import { createTalentRecord, updateTalent } from '@/lib/data/entities';
import { createCrewRecord, updateCrew } from '@/lib/data/entities';
import type { CrewTier } from '@/lib/types/database';

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
    else updates[key] = val || null;
  }
  const result = await updateClient(id, updates);
  if (!result) return { error: 'Failed to update client' };
  revalidatePath('/clients');
  return { ok: true };
}

export async function createTalentAction(formData: FormData) {
  const result = await createTalentRecord({
    legal_name: formData.get('legal_name') as string,
    working_name: formData.get('working_name') as string,
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
