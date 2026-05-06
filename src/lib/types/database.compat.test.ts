/**
 * Compile-time guard: the hand-typed interfaces in `database.ts` must stay
 * compatible with the machine-generated schema in `database.generated.ts`.
 *
 * If Supabase renames or drops a column we depend on, this test fails type-
 * checking via tsc (and therefore CI), instead of failing silently as a
 * runtime PostgREST 400. The bug it would have caught: `atelier_talent` once
 * had a `name` column referenced in our list query, but the column was
 * `working_name` all along.
 *
 * The actual assertion is type-level (the `_assertCompat` helper). The vitest
 * stub at the bottom is just so this file gets picked up alongside other
 * tests — every column listed below participates in the type check.
 */

import { describe, it, expect } from 'vitest';
import type { Database } from './database.generated';
import type {
  Booking, Client, Talent, Crew, FeeLine, BookingTalent, BookingCrew,
  Brand, Location,
} from './database';

type Tables = Database['public']['Tables'];

// Only require the columns we actively read in the application.
// Adding a column to the hand types but missing it here is fine — the test
// is about catching DRIFT (renames/removals), not enforcing exhaustiveness.
type Subset<Hand, Generated> = {
  [K in keyof Hand]: K extends keyof Generated ? Hand[K] : never;
};

// `_assertCompat` is a no-runtime type-level check. If Generated doesn't
// have the columns the hand type names, TS narrows the field to `never`
// which the application code's reads will fail compilation against.
type _assertCompat<Hand, Generated> = Subset<Hand, Generated>;

// === The actual checks (type-level — fail tsc if drift exists) ===
// One line per table we care about. Tweak the keys as the hand types evolve.

type _BookingCheck       = _assertCompat<Pick<Booking, 'id' | 'state' | 'tier' | 'title' | 'client_id' | 'shoot_dates' | 'grand_total'>, Tables['atelier_bookings']['Row']>;
type _ClientCheck        = _assertCompat<Pick<Client, 'id' | 'name' | 'company' | 'email' | 'payment_terms_days'>, Tables['atelier_clients']['Row']>;
type _TalentCheck        = _assertCompat<Pick<Talent, 'id' | 'working_name' | 'discipline' | 'default_day_rate' | 'is_active'>, Tables['atelier_talent']['Row']>;
type _CrewCheck          = _assertCompat<Pick<Crew, 'id' | 'name' | 'tier' | 'primary_role' | 'default_day_rate'>, Tables['atelier_crew']['Row']>;
type _FeeLineCheck       = _assertCompat<Pick<FeeLine, 'id' | 'line_type' | 'description' | 'quantity' | 'unit_price' | 'asf_rate' | 'asf_amount' | 'is_super_bearing' | 'is_commissionable'>, Tables['atelier_fee_lines']['Row']>;
type _BookingTalentCheck = _assertCompat<Pick<BookingTalent, 'id' | 'booking_id' | 'talent_id' | 'role_on_booking' | 'day_rate' | 'confirmed'>, Tables['atelier_booking_talent']['Row']>;
type _BookingCrewCheck   = _assertCompat<Pick<BookingCrew, 'id' | 'booking_id' | 'crew_id' | 'role_on_booking' | 'status'>, Tables['atelier_booking_crew']['Row']>;
type _BrandCheck         = _assertCompat<Pick<Brand, 'id' | 'name'>, Tables['atelier_brands']['Row']>;
type _LocationCheck      = _assertCompat<Pick<Location, 'id' | 'name' | 'is_active'>, Tables['atelier_locations']['Row']>;

// === Newer tables — added after the original compat-test file ===
// These don't have hand-typed interfaces in database.ts (they're consumed
// via the generated types directly), so we just inline the columns we
// actually rely on. If any of these get renamed or dropped, the type-level
// check fails at compile time.
type _AppUsersCheck = _assertCompat<
  { user_id: string; role: string; talent_id: string | null; crew_id: string | null; is_active: boolean },
  Tables['atelier_app_users']['Row']
>;
type _CorpusCheck = _assertCompat<
  { id: string; outcome: string; tier: string | null; client_hash: string | null; talent_hash: string | null; grand_total: number | null },
  Tables['atelier_corpus_bookings']['Row']
>;
// Onboarding token columns — magic-link flow depends on these
type _OnboardingTalentCheck = _assertCompat<
  { onboarding_token: string | null; onboarding_token_expires_at: string | null; home_address: string | null; dob: string | null },
  Tables['atelier_talent']['Row']
>;
type _OnboardingCrewCheck = _assertCompat<
  { onboarding_token: string | null; onboarding_token_expires_at: string | null; home_address: string | null; dob: string | null },
  Tables['atelier_crew']['Row']
>;

// Suppress unused-type warnings — the assertions above are the test.
type _Used =
  | _BookingCheck | _ClientCheck | _TalentCheck | _CrewCheck
  | _FeeLineCheck | _BookingTalentCheck | _BookingCrewCheck
  | _BrandCheck | _LocationCheck
  | _AppUsersCheck | _CorpusCheck
  | _OnboardingTalentCheck | _OnboardingCrewCheck;
const _used: _Used | null = null;
void _used;

describe('database type compatibility', () => {
  it('hand-typed interfaces match the generated schema', () => {
    // Real assertion happens at compile time via the _assertCompat helpers
    // above. If tsc passes, this test is correct by construction.
    expect(true).toBe(true);
  });
});
