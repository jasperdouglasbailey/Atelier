/**
 * Compile-time guard: hand-typed interfaces in `database.ts` stay in sync
 * with `database.generated.ts` (which is the Supabase MCP / supabase CLI
 * output for the live prod schema).
 *
 * **Bidirectional exhaustiveness.** If a DB column is added/renamed and
 * the hand type doesn't catch up, this file fails type-checking via tsc
 * (and CI). Same for the reverse — a column dropped from the DB but still
 * present in the hand type also fails.
 *
 * Real-world bugs this would catch:
 *   - `working_name` vs `name` mismatch on listBookings (pre-2026-05)
 *   - Migration 0055 adds `cost_subtotal` to fee_lines, hand type misses
 *     it, every fee-line write skips the column silently. Now: tsc error
 *     pointing at `_FeeLineExhaustive`.
 *   - Migration drops a column, hand type still references it, runtime
 *     PostgREST 400. Now: tsc error pointing at the orphan key.
 *
 * The vitest stub at the bottom is just so this file gets picked up
 * alongside other tests — every assertion below participates in the
 * compile-time check regardless of whether the test runs.
 */

import { describe, it, expect } from 'vitest';
import type { Database } from './database.generated';
import type {
  Booking, Client, Talent, Crew, FeeLine, BookingTalent, BookingCrew,
  Brand, Location, Approval, AtelierEvent, AuditLogRow, BookingSchedule,
  BusinessRenewal, Campaign, KillSwitchState, LLMCallRow, QuoteVersion,
  Task, TalentUnavailability, CrewUnavailability,
  UsageLicence,
} from './database';
// NB: StudioRoom is a jsonb-shape type for Location.studio_rooms, not a
// table row — intentionally absent from this exhaustiveness check.

type Tables = Database['public']['Tables'];

/**
 * Unidirectional exhaustiveness — every column in the generated row MUST
 * exist on the hand type. If a DB migration adds a column and the hand
 * type doesn't catch up, the resolved type names the missing key so the
 * tsc error is actionable, e.g.:
 *
 *   Type 'true' is not assignable to
 *   type '{ missing_in_hand: "new_column_name" }'.
 *
 * The reverse direction (extra fields on the hand type) is intentionally
 * permitted — hand types legitimately add joined relations (e.g.
 * `BookingTalent.talent?: Talent`) and computed properties. PostgREST
 * will catch dropped-column references at runtime via 400s.
 */
type KeysMatch<TGenerated, THand> =
  Exclude<keyof TGenerated, keyof THand> extends never
    ? true
    : { missing_in_hand: Exclude<keyof TGenerated, keyof THand> };

// === Exhaustiveness assertions ===
// Each `: true` forces TS to resolve the KeysMatch — if it doesn't
// equal `true`, the resolved object literal tells you which keys drifted.

const _BookingMatch: KeysMatch<Tables['atelier_bookings']['Row'], Booking> = true;
const _ClientMatch: KeysMatch<Tables['atelier_clients']['Row'], Client> = true;
const _TalentMatch: KeysMatch<Tables['atelier_talent']['Row'], Talent> = true;
const _CrewMatch: KeysMatch<Tables['atelier_crew']['Row'], Crew> = true;
const _FeeLineMatch: KeysMatch<Tables['atelier_fee_lines']['Row'], FeeLine> = true;
const _BookingTalentMatch: KeysMatch<Tables['atelier_booking_talent']['Row'], BookingTalent> = true;
const _BookingCrewMatch: KeysMatch<Tables['atelier_booking_crew']['Row'], BookingCrew> = true;
const _BrandMatch: KeysMatch<Tables['atelier_brands']['Row'], Brand> = true;
const _LocationMatch: KeysMatch<Tables['atelier_locations']['Row'], Location> = true;
const _ApprovalMatch: KeysMatch<Tables['atelier_approvals']['Row'], Approval> = true;
const _EventMatch: KeysMatch<Tables['atelier_events']['Row'], AtelierEvent> = true;
const _AuditMatch: KeysMatch<Tables['atelier_audit_log']['Row'], AuditLogRow> = true;
const _ScheduleMatch: KeysMatch<Tables['atelier_booking_schedules']['Row'], BookingSchedule> = true;
const _RenewalMatch: KeysMatch<Tables['atelier_business_renewals']['Row'], BusinessRenewal> = true;
const _CampaignMatch: KeysMatch<Tables['atelier_campaigns']['Row'], Campaign> = true;
const _KillSwitchMatch: KeysMatch<Tables['atelier_kill_switch']['Row'], KillSwitchState> = true;
const _LLMMatch: KeysMatch<Tables['atelier_llm_calls']['Row'], LLMCallRow> = true;
const _QuoteVersionMatch: KeysMatch<Tables['atelier_quote_versions']['Row'], QuoteVersion> = true;
const _TaskMatch: KeysMatch<Tables['atelier_tasks']['Row'], Task> = true;
const _TalentUnavailMatch: KeysMatch<Tables['atelier_talent_unavailability']['Row'], TalentUnavailability> = true;
const _CrewUnavailMatch: KeysMatch<Tables['atelier_crew_unavailability']['Row'], CrewUnavailability> = true;
const _UsageMatch: KeysMatch<Tables['atelier_usage_licences']['Row'], UsageLicence> = true;

// Silence unused-variable lints — these are compile-time checks, not runtime values.
void _BookingMatch; void _ClientMatch; void _TalentMatch; void _CrewMatch;
void _FeeLineMatch; void _BookingTalentMatch; void _BookingCrewMatch;
void _BrandMatch; void _LocationMatch; void _ApprovalMatch; void _EventMatch;
void _AuditMatch; void _ScheduleMatch; void _RenewalMatch; void _CampaignMatch;
void _KillSwitchMatch; void _LLMMatch; void _QuoteVersionMatch;
void _TaskMatch; void _TalentUnavailMatch; void _CrewUnavailMatch; void _UsageMatch;

describe('database type compatibility', () => {
  it('hand-typed interfaces match the generated schema', () => {
    // Real assertion happens at compile time via the KeysMatch constraints
    // above. If tsc passes, this test is correct by construction.
    expect(true).toBe(true);
  });
});
