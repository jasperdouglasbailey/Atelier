/**
 * Magic-link onboarding helpers.
 *
 * Token semantics:
 *   - One token per talent / crew row (overwrites on regenerate).
 *   - 14-day TTL; expired tokens are rejected by `findByOnboardingToken`.
 *   - Once `onboarding_completed = true` the token still works (people
 *     can come back and update), but the badge flips. We don't burn the
 *     token on first use — it's a personal account-management URL.
 *
 * The token IS the secret. Anyone with the URL can update the row, so
 * we ONLY expose fields that are reasonable for a person to manage
 * about themselves: name, contact, super, ABN, address. Day rate is
 * editable too — that's the whole point of the link.
 */

import { randomUUID } from 'crypto';
import { createServiceClient } from '@/lib/supabase/service';
import { reportDataError } from '@/lib/utils/data-errors';

export type OnboardingEntityType = 'talent' | 'crew';

const TOKEN_TTL_DAYS = 14;

/** Subset of columns the magic-link form lets the entity edit themselves. */
export type OnboardingPrefill = {
  id: string;
  type: OnboardingEntityType;
  // Identity
  legal_name: string | null;
  display_name: string;        // working_name (talent) or name (crew)
  email: string | null;
  mobile: string | null;
  pronouns: string | null;
  // Compliance
  abn: string | null;
  gst_registered: boolean;
  // Super
  super_fund_name: string | null;
  super_member_number: string | null;
  super_usi: string | null;
  // Address & DOB
  home_address: string | null;
  dob: string | null;
  // Rate (the whole point of the link)
  default_day_rate: number | null;
};

export type OnboardingPayload = {
  legal_name: string;
  display_name: string;
  email: string;
  mobile?: string | null;
  pronouns?: string | null;
  abn?: string | null;
  gst_registered: boolean;
  super_fund_name?: string | null;
  super_member_number?: string | null;
  super_usi?: string | null;
  home_address?: string | null;
  dob?: string | null;
  default_day_rate?: number | null;
};

/**
 * Generate (or rotate) an onboarding token for the given entity.
 * Returns the new token. Old tokens are overwritten.
 */
export async function generateOnboardingToken(
  type: OnboardingEntityType,
  entityId: string,
): Promise<string | null> {
  const supabase = createServiceClient();
  const token = randomUUID();
  const expiresAt = new Date(Date.now() + TOKEN_TTL_DAYS * 24 * 60 * 60 * 1000).toISOString();

  const table = type === 'talent' ? 'atelier_talent' : 'atelier_crew';
  const { error } = await supabase
    .from(table)
    .update({
      onboarding_token: token,
      onboarding_token_expires_at: expiresAt,
    })
    .eq('id', entityId);

  if (error) {
    reportDataError(`[onboarding] generate token (${type})`, error);
    return null;
  }
  return token;
}

/**
 * Look up an entity by their onboarding token. Returns null on miss or
 * expired token.
 */
export async function findByOnboardingToken(
  token: string,
): Promise<OnboardingPrefill | null> {
  if (!token) return null;
  const supabase = createServiceClient();
  const now = new Date().toISOString();

  // Try talent first
  const { data: talent } = await supabase
    .from('atelier_talent')
    .select('id, legal_name, working_name, email, mobile, pronouns, abn, gst_registered, super_fund_name, super_member_number, super_usi, home_address, dob, default_day_rate, onboarding_token_expires_at')
    .eq('onboarding_token', token)
    .maybeSingle();

  if (talent && (!talent.onboarding_token_expires_at || talent.onboarding_token_expires_at > now)) {
    return {
      id: talent.id,
      type: 'talent',
      legal_name: talent.legal_name,
      display_name: talent.working_name,
      email: talent.email,
      mobile: talent.mobile,
      pronouns: talent.pronouns,
      abn: talent.abn,
      gst_registered: talent.gst_registered ?? false,
      super_fund_name: talent.super_fund_name,
      super_member_number: talent.super_member_number,
      super_usi: talent.super_usi,
      home_address: talent.home_address,
      dob: talent.dob,
      default_day_rate: talent.default_day_rate,
    };
  }

  // Fall through to crew
  const { data: crew } = await supabase
    .from('atelier_crew')
    .select('id, name, email, mobile, abn, gst_registered, super_fund_name, super_member_number, super_usi, home_address, dob, default_day_rate, onboarding_token_expires_at')
    .eq('onboarding_token', token)
    .maybeSingle();

  if (crew && (!crew.onboarding_token_expires_at || crew.onboarding_token_expires_at > now)) {
    return {
      id: crew.id,
      type: 'crew',
      legal_name: crew.name,
      display_name: crew.name,
      email: crew.email,
      mobile: crew.mobile,
      pronouns: null,
      abn: crew.abn,
      gst_registered: crew.gst_registered ?? false,
      super_fund_name: crew.super_fund_name,
      super_member_number: crew.super_member_number,
      super_usi: crew.super_usi,
      home_address: crew.home_address,
      dob: crew.dob,
      default_day_rate: crew.default_day_rate,
    };
  }

  return null;
}

/**
 * Apply a self-service update to an entity by token. Marks
 * onboarding_completed = true so Jasper sees the badge flip but does
 * NOT activate the entity (`is_active`) — that still requires owner
 * sign-off.
 */
export async function applyOnboardingByToken(
  token: string,
  payload: OnboardingPayload,
): Promise<{ ok: true; type: OnboardingEntityType; entityId: string } | { ok: false; error: string }> {
  const target = await findByOnboardingToken(token);
  if (!target) return { ok: false, error: 'Link is invalid or has expired.' };

  const supabase = createServiceClient();

  if (target.type === 'talent') {
    const { error } = await supabase
      .from('atelier_talent')
      .update({
        legal_name: payload.legal_name,
        working_name: payload.display_name || payload.legal_name,
        email: payload.email,
        mobile: payload.mobile ?? null,
        pronouns: payload.pronouns ?? null,
        abn: payload.abn ?? null,
        gst_registered: payload.gst_registered,
        super_fund_name: payload.super_fund_name ?? null,
        super_member_number: payload.super_member_number ?? null,
        super_usi: payload.super_usi ?? null,
        home_address: payload.home_address ?? null,
        dob: payload.dob ?? null,
        default_day_rate: payload.default_day_rate ?? null,
        onboarding_completed: true,
      })
      .eq('id', target.id);

    if (error) {
      reportDataError('[onboarding] talent update', error);
      return { ok: false, error: 'Could not save your details. Please try again.' };
    }
  } else {
    const { error } = await supabase
      .from('atelier_crew')
      .update({
        name: payload.legal_name,
        email: payload.email,
        mobile: payload.mobile ?? null,
        abn: payload.abn ?? null,
        gst_registered: payload.gst_registered,
        super_fund_name: payload.super_fund_name ?? null,
        super_member_number: payload.super_member_number ?? null,
        super_usi: payload.super_usi ?? null,
        home_address: payload.home_address ?? null,
        dob: payload.dob ?? null,
        default_day_rate: payload.default_day_rate ?? null,
        onboarding_completed: true,
      })
      .eq('id', target.id);

    if (error) {
      reportDataError('[onboarding] crew update', error);
      return { ok: false, error: 'Could not save your details. Please try again.' };
    }
  }

  return { ok: true, type: target.type, entityId: target.id };
}
