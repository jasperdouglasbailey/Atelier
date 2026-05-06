'use server';

import { revalidatePath } from 'next/cache';
import {
  createBusinessRenewal, updateBusinessRenewal, deleteBusinessRenewal,
} from '@/lib/data/business-renewals';
import { logAudit } from '@/lib/utils/audit';
import { getCurrentActor } from '@/lib/utils/actor';

export async function createBusinessRenewalAction(formData: FormData) {
  const type = (formData.get('type') as string)?.trim();
  const label = (formData.get('label') as string)?.trim();
  const expires_at = (formData.get('expires_at') as string)?.trim();
  const notes = ((formData.get('notes') as string) || '').trim() || null;

  if (!type) return { error: 'Type is required' };
  if (!label) return { error: 'Label is required' };
  if (!expires_at) return { error: 'Expiry date is required' };

  const result = await createBusinessRenewal({ type, label, expires_at, notes });
  if (!result) return { error: 'Failed to create renewal' };

  await logAudit({
    userId: await getCurrentActor(),
    action: 'create',
    tableName: 'atelier_business_renewals',
    recordId: result.id,
    newValue: { type, label, expires_at },
  }).catch(() => {});

  revalidatePath('/settings/business-renewals');
  return { ok: true, id: result.id };
}

export async function updateBusinessRenewalAction(id: string, formData: FormData) {
  const updates: Record<string, unknown> = {};
  const fields = ['type', 'label', 'expires_at', 'notes'] as const;
  for (const f of fields) {
    const v = formData.get(f);
    if (v !== null) updates[f] = (v as string) || null;
  }
  if (formData.get('is_archived') !== null) {
    updates.is_archived = formData.get('is_archived') === 'true';
  }

  const result = await updateBusinessRenewal(id, updates);
  if (!result) return { error: 'Failed to update renewal' };

  await logAudit({
    userId: await getCurrentActor(),
    action: 'update',
    tableName: 'atelier_business_renewals',
    recordId: id,
    newValue: updates as never,
  }).catch(() => {});

  revalidatePath('/settings/business-renewals');
  return { ok: true };
}

export async function deleteBusinessRenewalAction(id: string) {
  await logAudit({
    userId: await getCurrentActor(),
    action: 'delete',
    tableName: 'atelier_business_renewals',
    recordId: id,
  }).catch(() => {});
  const ok = await deleteBusinessRenewal(id);
  if (!ok) return { error: 'Failed to delete renewal' };
  revalidatePath('/settings/business-renewals');
  return { ok: true };
}
