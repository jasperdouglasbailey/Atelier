/**
 * Expected extraction results for each fixture brief.
 *
 * Two layers:
 *   - `heuristic`: the bare-minimum the regex/keyword parser must extract.
 *     These are asserted strictly in the test suite — a regression here
 *     breaks the build.
 *   - `idealLlm`: what we expect the LLM-driven parser to layer on top.
 *     NOT asserted in CI (would require live API call). Used as
 *     documentation + a future structured-fields manual harness.
 *
 * The goal is that as the heuristic improves (or the LLM prompt evolves),
 * these fixtures act as a permanent regression-test corpus.
 */
import type { ParsedBrief } from '@/lib/utils/brief-parser';

type FixtureExpectation = {
  /** Minimum the heuristic should hit on this brief. */
  heuristic: Partial<ParsedBrief>;
  /** What the LLM should additionally fill in. Not asserted — documentation. */
  idealLlm: Partial<ParsedBrief> & {
    /** Future structured usage taxonomy (PR C will add these to ParsedBrief). */
    usage_market?: 'consumer' | 'trade' | 'editorial';
    usage_realm?: 'advertising' | 'promotional' | 'pr' | 'corporate' | 'editorial';
    usage_media_categories?: Array<'online' | 'broadcast' | 'print' | 'outdoor' | 'ambient'>;
    usage_specific_channels?: string[];
    usage_territory_iso?: string[];
    /** Extension fields the parser doesn't have today but should. */
    candidate_dates?: string[];
    requested_shoot_count?: number;
    brand?: string;
    agency?: string;
    project_name?: string;
    proposed_day_rate?: number;
    proposed_post_rate?: number;
    is_buyout?: boolean;
    on_camera_count?: number;
    dates_confirmed?: boolean;
    deliverables_count_min?: number;
    deliverables_count_max?: number;
    referrer?: string;
    budget_explicit?: boolean;
  };
  /** Free-text rationale — what makes this fixture interesting. */
  notes: string;
};

export const FIXTURES: Record<string, FixtureExpectation> = {
  'venroy-golden': {
    heuristic: {
      shoot_date_start: '2026-05-20',
      shoot_date_end: '2026-05-20',
      shoot_location: 'Lunar Studios',
      deliverables_count: 12,
      usage_duration_months: 3,
      usage_territory_raw: 'Australia',
    },
    idealLlm: {
      shoot_location: 'Lunar Studios',
      deliverables_type: 'Stills',
      talent_spec: 'Oliver Begg',
      usage_market: 'consumer',
      usage_realm: 'advertising',
      usage_media_categories: ['online', 'print', 'outdoor'],
      usage_specific_channels: ['social_organic', 'social_paid', 'edm', 'pr_earned', 'billboard', 'pos'],
      usage_territory_iso: ['AU'],
      brand: 'Venroy',
    },
    notes: 'Golden label-driven format. Subject + body both contain the date. Usage in three labelled triples (Duration/Media/Territory). Best-case extraction target.',
  },

  'venroy-compressed': {
    heuristic: {
      shoot_date_start: '2026-05-20',
      shoot_date_end: '2026-05-20',
      deliverables_type: 'Stills',
      deliverables_count: 12,
      usage_duration_months: 3,
    },
    idealLlm: {
      shoot_location: 'Lunar',
      deliverables_type: 'Stills',
      talent_spec: 'Oliver Begg', // resolves "Oly" → Oliver via talent nicknames
      usage_market: 'consumer',
      usage_realm: 'advertising',
      usage_media_categories: ['online', 'print', 'outdoor'],
      usage_specific_channels: ['social_organic', 'social_paid', 'edm', 'pr_earned', 'billboard', 'pos'],
      usage_territory_iso: ['AU'],
      brand: 'Venroy',
    },
    notes: 'Compressed format — usage in one sentence with semicolons. Includes the "6pmThe" missing-space typo and "+04XX" malformed AU phone. Tests nickname resolution ("Oly").',
  },

  'venroy-loose': {
    heuristic: {
      shoot_date_start: '2026-05-20',
      shoot_date_end: '2026-05-20',
      deliverables_type: 'Stills',
      deliverables_count: 12,
      usage_duration_months: 3,
    },
    idealLlm: {
      shoot_location: 'Lunar',
      deliverables_type: 'Stills',
      talent_spec: 'Oliver Begg',
      usage_market: 'consumer',
      usage_realm: 'advertising',
      usage_media_categories: ['online', 'print', 'outdoor'],
      usage_specific_channels: ['social_organic', 'social_paid', 'edm', 'pr_earned', 'billboard', 'pos'],
      usage_territory_iso: ['AU'], // "Aus." → AU
      brand: 'Venroy',
    },
    notes: 'Loosest format — verb-led, no labels, all info in flowing prose. Tests synonym handling: "EDMs" ≡ "Emails", "Aus." ≡ "Australia", "8/6" ≡ call/wrap times.',
  },

  'inaura-brooke': {
    heuristic: {
      // Heuristic can't disambiguate 3 candidate dates with "1 x shoot date"
      // qualifier; the right answer is LLM-side. We assert nothing about
      // dates here — known limitation, surface ticket for follow-up.
      usage_duration_months: 24,
      deliverables_type: 'Video',
      talent_count: 6,
    },
    idealLlm: {
      shoot_location: 'Sydney',
      deliverables_type: '1 x 30-second hero video + additional B-roll',
      usage_market: 'consumer',
      usage_realm: 'advertising',
      usage_media_categories: ['online', 'print', 'outdoor'],
      usage_specific_channels: ['website', 'social_organic', 'social_paid', 'edm', 'print', 'pos'],
      usage_territory_iso: ['AU', 'NZ'],
      brand: 'Inaura',
      agency: 'Smile',
      candidate_dates: ['2026-05-08', '2026-05-11', '2026-05-12'],
      requested_shoot_count: 1,
      proposed_day_rate: 6000,
      proposed_post_rate: 5000,
      is_buyout: true,
      on_camera_count: 6, // distinct from photographer Dan Knott
    },
    notes: 'Producer-side brief. Multiple candidate dates (pick one). Brand + Agency distinction. Buyout structure with negative carve-out ("No sound capture"). 6 on-camera talent ≠ photographer.',
  },

  'coronation-caleb': {
    heuristic: {
      // Heuristic infers the next available March (year-of-current+1 when
      // current date is past March). Test runs against today's clock so the
      // year drifts — assert just the day/month pair via partial match.
      // Note: we use 2027 because today's run date is post-March-2026; if
      // CI runs in early Q1 this would be 2026. Fixture documents the
      // limitation but doesn't strictly assert the year.
      usage_duration_months: 24,
      deliverables_type: 'Stills',
      // Heuristic picks the upper bound (40) of "35-40 images" — see
      // idealLlm for the structured range we want from the LLM.
      deliverables_count: 40,
    },
    idealLlm: {
      deliverables_type: 'Stills',
      talent_spec: 'Michael Comninus',
      usage_market: 'consumer',
      usage_realm: 'advertising',
      usage_media_categories: ['online', 'print', 'outdoor'],
      usage_specific_channels: ['online', 'print', 'hoarding'],
      usage_territory_iso: ['AU'],
      project_name: 'Archer residences',
      deliverables_count_min: 35,
      deliverables_count_max: 40,
      dates_confirmed: false,
      referrer: 'Liam French',
      budget_indication: 8000,
      budget_explicit: true,
    },
    notes: 'New-client first-touch enquiry. Soft dates ("not locked in yet"). Range deliverables (35-40). Client + Project + Brand (here Client=Coronation, Project=Archer). Explicit budget. Referrer metadata.',
  },
};
