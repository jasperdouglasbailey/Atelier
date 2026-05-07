/**
 * Business renewals — pure types and constants.
 *
 * Extracted from business-renewals.ts so client components can import
 * these without pulling in server-only Supabase code (next/headers).
 * The data functions that use createClient() stay in business-renewals.ts.
 */

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
  { value: 'insurance_public_liability',       label: 'Public liability insurance' },
  { value: 'insurance_professional_indemnity', label: 'Professional indemnity insurance' },
  { value: 'insurance_workers_comp',           label: 'Workers compensation' },
  { value: 'insurance_equipment',              label: 'Equipment / contents insurance' },
  { value: 'bas_quarterly',                    label: 'BAS quarterly lodgement' },
  { value: 'asic_review',                      label: 'ASIC company review' },
  { value: 'abn_gst_review',                   label: 'ABN / GST registration review' },
  { value: 'domain_renewal',                   label: 'Domain renewal' },
  { value: 'accountant_engagement',            label: 'Accountant engagement' },
  { value: 'other',                            label: 'Other' },
];

export function statusFor(expiresAt: string): { daysUntil: number; status: ExpiryStatus } {
  const days = Math.floor((new Date(expiresAt).getTime() - Date.now()) / (1000 * 60 * 60 * 24));
  let status: ExpiryStatus;
  if (days <= 0) status = 'expired';
  else if (days <= EXPIRY_DANGER_DAYS) status = 'danger';
  else if (days <= EXPIRY_WARN_DAYS) status = 'warning';
  else status = 'ok';
  return { daysUntil: days, status };
}
