/**
 * Compliance data — aggregated view of document expiries and missing data
 * across all active talent.
 *
 * Crew are tracked separately (they have fewer compliance requirements in
 * Australian commercial photography — no WWCC requirement in the same way,
 * no talent-agency mandate for passport tracking). Crew compliance is limited
 * to ABN presence and super setup.
 *
 * Thresholds:
 *   - EXPIRY_WARN_DAYS  90  — yellow warning
 *   - EXPIRY_DANGER_DAYS 30 — red / past
 */

import { createClient } from '@/lib/supabase/server';

export const EXPIRY_WARN_DAYS = 90;   // amber
export const EXPIRY_DANGER_DAYS = 30; // red (includes already expired)

export type ExpiryStatus = 'expired' | 'danger' | 'warning' | 'ok';

export interface TalentComplianceRow {
  id: string;
  working_name: string;
  email: string | null;
  is_active: boolean;
  onboarding_completed: boolean;
  // Missing critical fields
  missingAbn: boolean;
  missingSuperFund: boolean;
  missingEmergencyContact: boolean;
  missingMobile: boolean;
  // Expiry fields (ISO date string or null)
  passport_expiry: string | null;
  passportStatus: ExpiryStatus | 'missing';
  drivers_licence_expiry: string | null;
  licenceStatus: ExpiryStatus | 'missing';
  wwcc_number: string | null;
  wwcc_expiry: string | null;
  wwccStatus: ExpiryStatus | 'missing';
  visa_expiry: string | null;
  visaStatus: ExpiryStatus | 'missing';
  // True when this row has any concern
  hasConcern: boolean;
}

export interface CrewComplianceRow {
  id: string;
  name: string;
  email: string | null;
  is_active: boolean;
  onboarding_completed: boolean;
  missingAbn: boolean;
  missingSuperFund: boolean;
  missingMobile: boolean;
  hasConcern: boolean;
}

export interface ComplianceReport {
  talent: TalentComplianceRow[];
  crew: CrewComplianceRow[];
  /** Snapshot timestamp for the "last checked" label */
  asAt: string;
}

function daysUntil(iso: string | null): number | null {
  if (!iso) return null;
  const ms = new Date(iso).getTime() - Date.now();
  return Math.floor(ms / (1000 * 60 * 60 * 24));
}

function expiryStatus(iso: string | null): ExpiryStatus | 'missing' {
  if (!iso) return 'missing';
  const days = daysUntil(iso)!;
  if (days <= 0) return 'expired';
  if (days <= EXPIRY_DANGER_DAYS) return 'danger';
  if (days <= EXPIRY_WARN_DAYS) return 'warning';
  return 'ok';
}

export async function getComplianceReport(): Promise<ComplianceReport> {
  const supabase = await createClient();

  const [{ data: talentData }, { data: crewData }] = await Promise.all([
    supabase
      .from('atelier_talent')
      .select('id, working_name, email, mobile, is_active, onboarding_completed, abn, super_fund_name, emergency_name, emergency_mobile, passport_expiry, drivers_licence_expiry, wwcc_number, wwcc_expiry, visa_expiry')
      .order('working_name'),
    supabase
      .from('atelier_crew')
      .select('id, name, email, mobile, is_active, onboarding_completed, abn, super_fund_name')
      .order('name'),
  ]);

  const talent: TalentComplianceRow[] = (talentData ?? []).map((t) => {
    const passportStatus = expiryStatus(t.passport_expiry);
    const licenceStatus = expiryStatus(t.drivers_licence_expiry);
    const wwccStatus = expiryStatus(t.wwcc_expiry);
    const visaStatus = expiryStatus(t.visa_expiry);

    const missingAbn = !t.abn;
    const missingSuperFund = !t.super_fund_name;
    const missingEmergencyContact = !t.emergency_name && !t.emergency_mobile;
    const missingMobile = !t.mobile;

    const hasExpiryIssue = [passportStatus, licenceStatus, wwccStatus, visaStatus].some(
      (s) => s === 'expired' || s === 'danger' || s === 'warning',
    );

    const hasConcern = t.is_active && (
      missingAbn || missingEmergencyContact || hasExpiryIssue || !t.onboarding_completed
    );

    return {
      id: t.id,
      working_name: t.working_name,
      email: t.email,
      is_active: t.is_active,
      onboarding_completed: t.onboarding_completed,
      missingAbn,
      missingSuperFund,
      missingEmergencyContact,
      missingMobile,
      passport_expiry: t.passport_expiry,
      passportStatus,
      drivers_licence_expiry: t.drivers_licence_expiry,
      licenceStatus,
      wwcc_number: t.wwcc_number,
      wwcc_expiry: t.wwcc_expiry,
      wwccStatus,
      visa_expiry: t.visa_expiry,
      visaStatus,
      hasConcern,
    };
  });

  const crew: CrewComplianceRow[] = (crewData ?? []).map((c) => {
    const missingAbn = !c.abn;
    const missingSuperFund = !c.super_fund_name;
    const missingMobile = !c.mobile;
    const hasConcern = c.is_active && (missingAbn || !c.onboarding_completed);
    return {
      id: c.id,
      name: c.name,
      email: c.email,
      is_active: c.is_active,
      onboarding_completed: c.onboarding_completed,
      missingAbn,
      missingSuperFund,
      missingMobile,
      hasConcern,
    };
  });

  return { talent, crew, asAt: new Date().toISOString() };
}
