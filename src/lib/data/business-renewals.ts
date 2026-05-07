/**
 * Business renewals data layer — agency-side compliance dates.
 *
 * Types and constants live in business-renewals-types.ts so client
 * components can import them without pulling in server-only code.
 *
 * Pairs with src/lib/data/compliance.ts (talent/crew document expiries).
 * Owner/partner only — RLS enforces this at the DB layer.
 */

import { createClient } from '@/lib/supabase/server';
import { reportDataError } from '@/lib/utils/data-errors';
import type { BusinessRenewal } from '@/lib/types/database';
import { statusFor } from './business-renewals-types';

// Re-export everything so existing server imports don't break.
export type { ExpiryStatus, BusinessRenewalRow } from './business-renewals-types';
export { EXPIRY_WARN_DAYS, EXPIRY_DANGER_DAYS, RENEWAL_TYPE_OPTIONS } from './business-renewals-types';

export async function listBusinessRenewals(opts?: {
  includeArchived?: boolean;
}): Promise<import('./business-renewals-types').BusinessRenewalRow[]> {
  const supabase = await createClient();
  let query = supabase
    .from('atelier_business_renewals')
    .select('*')
    .order('expires_at', { ascending: true });
  if (!opts?.includeArchived) query = query.eq('is_archived', false);
  const { data, error } = await query;
  if (error) { reportDataError('[business-renewals] list', error); return []; }
  return (data ?? []).map((r) => {
    const row = r as BusinessRenewal;
    return { ...row, ...statusFor(row.expires_at) };
  });
}

export async function getBusinessRenewal(id: string): Promise<BusinessRenewal | null> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from('atelier_business_renewals')
    .select('*')
    .eq('id', id)
    .maybeSingle();
  if (error) { reportDataError('[business-renewals] get', error); return null; }
  return (data as BusinessRenewal) ?? null;
}

export async function createBusinessRenewal(input: {
  type: string;
  label: string;
  expires_at: string;
  notes?: string | null;
}): Promise<BusinessRenewal | null> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from('atelier_business_renewals')
    .insert(input)
    .select()
    .single();
  if (error) { reportDataError('[business-renewals] create', error); return null; }
  return data as BusinessRenewal;
}

export async function updateBusinessRenewal(
  id: string,
  updates: Partial<BusinessRenewal>,
): Promise<BusinessRenewal | null> {
  const supabase = await createClient();
  delete (updates as Record<string, unknown>).id;
  delete (updates as Record<string, unknown>).created_at;
  const { data, error } = await supabase
    .from('atelier_business_renewals')
    .update({ ...updates, updated_at: new Date().toISOString() })
    .eq('id', id)
    .select()
    .single();
  if (error) { reportDataError('[business-renewals] update', error); return null; }
  return data as BusinessRenewal;
}

export async function deleteBusinessRenewal(id: string): Promise<boolean> {
  const supabase = await createClient();
  const { error } = await supabase
    .from('atelier_business_renewals')
    .delete()
    .eq('id', id);
  if (error) { reportDataError('[business-renewals] delete', error); return false; }
  return true;
}
