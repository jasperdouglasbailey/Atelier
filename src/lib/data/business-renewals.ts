/**
 * Business renewals data layer — agency-side compliance dates.
 *
 * Pairs with src/lib/data/compliance.ts (talent/crew document expiries).
 * Owner/partner only — RLS enforces this at the DB layer.
 */

import { createClient } from '@/lib/supabase/server';
import { reportDataError } from '@/lib/utils/data-errors';
import type { BusinessRenewal } from '@/lib/types/database';

export type ExpiryStatus = 'expired' | 'danger' | 'warning' | 'ok';

export const EXPIRY_WARN_DAYS = 90;
export const EXPIRY_DANGER_DAYS = 30;

export interface BusinessRenewalRow extends BusinessRenewal {
  daysUntil: number;
  status: ExpiryStatus;
}

/** Common renewal types Jasper books against. UI offers these as a dropdown
 *  but accepts custom types too — `type` is free-text in the DB. */
export const RENEWAL_TYPE_OPTIONS: Array<{ value: string; label: string }> = [
  { value: 'insurance_public_liability',     label: 'Public liability insurance' },
  { value: 'insurance_professional_indemnity', label: 'Professional indemnity insurance' },
  { value: 'insurance_workers_comp',         label: 'Workers compensation' },
  { value: 'insurance_equipment',            label: 'Equipment / contents insurance' },
  { value: 'bas_quarterly',                  label: 'BAS quarterly lodgement' },
  { value: 'asic_review',                    label: 'ASIC company review' },
  { value: 'abn_gst_review',                 label: 'ABN / GST registration review' },
  { value: 'domain_renewal',                 label: 'Domain renewal' },
  { value: 'accountant_engagement',          label: 'Accountant engagement' },
  { value: 'other',                          label: 'Other' },
];

function statusFor(expiresAt: string): { daysUntil: number; status: ExpiryStatus } {
  const days = Math.floor((new Date(expiresAt).getTime() - Date.now()) / (1000 * 60 * 60 * 24));
  let status: ExpiryStatus;
  if (days <= 0) status = 'expired';
  else if (days <= EXPIRY_DANGER_DAYS) status = 'danger';
  else if (days <= EXPIRY_WARN_DAYS) status = 'warning';
  else status = 'ok';
  return { daysUntil: days, status };
}

export async function listBusinessRenewals(opts?: {
  includeArchived?: boolean;
}): Promise<BusinessRenewalRow[]> {
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
