/**
 * Brief Intake Agent
 *
 * Extracts structured booking fields from a raw brief/email using:
 *   1. Heuristic parser (always runs, no LLM cost, instant)
 *   2. LLM parser (runs when ANTHROPIC_API_KEY is set, higher accuracy)
 *
 * The LLM result is merged on top of the heuristic result — if the LLM
 * is unavailable, the heuristic result is used as-is. This means the
 * brief parser always works, even without an API key.
 *
 * Doctrine:
 *   - Never auto-applies results. Always surfaces as suggestions to Jasper.
 *   - If both parsers agree, confidence is high.
 *   - If they disagree, both values are presented with their sources.
 *   - LLM call is logged to atelier_llm_calls for cost tracking.
 */

import { parseBrief, type ParsedBrief } from '@/lib/utils/brief-parser';
import { callLLMJson, callLLM } from '@/lib/integrations/anthropic';
import { buildConfidenceContract, type ConfidenceContract } from './agent-primitives';

// ============================================================
// Types
// ============================================================

/**
 * Structured usage taxonomy — LLM-only fields surfaced on the intake result.
 * Persisted to atelier_bookings in PR C (a follow-up migration). Until then
 * these stay on the in-memory result; BriefParser UI can preview them but
 * `applyBriefSuggestionsAction` does not yet write them.
 */
export type StructuredUsage = {
  usage_market: 'consumer' | 'trade' | 'editorial' | null;
  usage_realm: 'advertising' | 'promotional' | 'pr' | 'corporate' | 'editorial' | null;
  usage_media_categories: Array<'online' | 'broadcast' | 'print' | 'outdoor' | 'ambient'>;
  usage_specific_channels: string[];
  usage_territory_iso: string[];
};

export const EMPTY_STRUCTURED_USAGE: StructuredUsage = {
  usage_market: null,
  usage_realm: null,
  usage_media_categories: [],
  usage_specific_channels: [],
  usage_territory_iso: [],
};

/**
 * LLM-only fields surfaced on the intake result (added 2026-05-18).
 * Each maps directly to a booking column the operator can apply.
 *
 * Added 2026-05-19:
 *   - `grade_retouch_scope` lets the LLM distinguish "grade only" from
 *     "grade + retouch" when the brief specifies one but not the other.
 *     Combined with `post_production_ownership`, the engine can capture
 *     the common split case: grade by artist, retouch by client.
 */
export type ExtraBriefFields = {
  /** Campaign/project name suggestion to upgrade the booking title. */
  title_suggestion: string | null;
  /** Maps to atelier_post_production_ownership enum. */
  post_production_ownership: 'us_via_artist' | 'us_via_post_team' | 'client_in_house' | 'client_outsourced' | null;
  /** Maps to atelier_grade_retouch_scope enum. */
  grade_retouch_scope: 'grade_and_retouch' | 'grade_only' | null;
};

export const EMPTY_EXTRA_BRIEF_FIELDS: ExtraBriefFields = {
  title_suggestion: null,
  post_production_ownership: null,
  grade_retouch_scope: null,
};

export type BriefIntakeResult = ParsedBrief & StructuredUsage & ExtraBriefFields & {
  source: 'heuristic' | 'llm' | 'merged';
  confidence: number; // 0–100
  llmAvailable: boolean;
  /** Specific fields or aspects the extraction is uncertain about. */
  uncertainty_sources: string[];
  /** LLM critique: things that might be wrong or need verification. */
  critique: string[];
  /**
   * Doctrine confidence contract — populated alongside the legacy flat
   * fields above so existing callers don't break. New callers should
   * read this for the canonical shape (output, confidence, top 2
   * uncertainties, optional bestNextQuestion when confidence < 85).
   */
  contract: ConfidenceContract<ParsedBrief>;
};

/**
 * Generate the single best follow-up question Jasper could ask the client
 * to most raise extraction confidence. Returns null when nothing useful
 * is missing.
 */
function bestNextQuestion(parsed: ParsedBrief, missing: string[]): string | null {
  if (missing.length === 0) return null;
  // Pick the most actionable single question — shoot dates first, then
  // location, then deliverables. Order matters: knowing the date unblocks
  // crew availability checks; location unblocks travel costs.
  if (parsed.shoot_date_start == null) {
    return 'Can you confirm the shoot date(s)? The brief mentions timing but no firm date.';
  }
  if (parsed.shoot_location == null) {
    return 'Where will the shoot take place — studio, location, or both?';
  }
  if (parsed.deliverables_type == null) {
    return 'What deliverables are you expecting (stills, BTS video, both)?';
  }
  // talent_count removed from the platform per Jasper 2026-05-18 — no
  // follow-up question for it. Heuristic still extracts the field for
  // backward compat with old fixtures, but it's never surfaced in UI.
  return null;
}

// ============================================================
// LLM-powered extraction
// ============================================================

type LLMBriefOutput = Partial<{
  shoot_location: string;
  shoot_date_start: string; // YYYY-MM-DD
  shoot_date_end: string;
  shoot_date_notes: string;
  // talent_count removed 2026-05-18 — Jasper doesn't need it on the
  // platform. talent_spec stays for natural-language description.
  talent_spec: string;
  deliverables_type: string;
  deliverables_count: number;
  usage_duration_months: number;
  usage_territory_raw: string; // e.g. "Australia"
  usage_media_raw: string;     // e.g. "POS, social media, digital display"
  budget_indication: number;
  /** Production contact at the client/agency. The brief almost always
   *  names a primary contact ("The producer will be Cat Rose", "X is
   *  producing", etc.). Added 2026-05-19. */
  producer_name: string;
  /** Phone for the producer. AU formats: 04xx, (02)…, +61… */
  producer_phone: string;
  /** Email for the producer. NOT the email-signature sender — see
   *  PRODUCER CONTACT rule in the system prompt. */
  producer_email: string;
  /** Shoot start (call time). HH:MM 24-hour. */
  call_time: string;
  /** Shoot finish (wrap time). HH:MM 24-hour. */
  wrap_time: string;
  /**
   * Suggested booking title — typically the campaign / project name
   * pulled from phrases like "For X campaign", "X collection", or
   * "X project". Used to surface a better title than the auto-generated
   * one set when converting from the inbox.
   */
  title_suggestion: string;
  /**
   * Who owns post-production. Maps from natural-language phrases:
   *   "client doing post in-house" / "client handles post" → 'client_in_house'
   *   "we'll do post" / "you handle the retouching" → 'us_via_post_team'
   *   "artist handles post" / "Oliver to retouch" → 'us_via_artist'
   *   "external post house" → 'client_outsourced'
   * Matches the `atelier_post_production_ownership` enum.
   */
  post_production_ownership: 'us_via_artist' | 'us_via_post_team' | 'client_in_house' | 'client_outsourced';
  /** Scope of post-production work the agency owns. Captures the split
   *  case where the brief says e.g. "graded by [artist] but retouched
   *  by us (= client)" — owner = artist, scope = grade_only. */
  grade_retouch_scope: 'grade_and_retouch' | 'grade_only';
  // ─── Structured usage taxonomy (added 2026-05-17, PR #169) ───────
  // Maps directly to the advertising-media + market-realm doctrine.
  // Surfaced through BriefIntakeResult; persisted via PR C (not yet).
  // Heuristic parser does NOT populate these — LLM-only fields.
  usage_market: 'consumer' | 'trade' | 'editorial';
  usage_realm: 'advertising' | 'promotional' | 'pr' | 'corporate' | 'editorial';
  /** Top-level media categories. */
  usage_media_categories: Array<'online' | 'broadcast' | 'print' | 'outdoor' | 'ambient'>;
  /** Specific channels within the categories, e.g. ["edm", "social_paid", "ooh"]. */
  usage_specific_channels: string[];
  /** ISO-3166 alpha-2 country codes — e.g. ["AU", "NZ"] for "Australia and New Zealand". */
  usage_territory_iso: string[];
}>;

function isLLMBriefOutput(v: unknown): v is LLMBriefOutput {
  return typeof v === 'object' && v !== null;
}

const BRIEF_INTAKE_SYSTEM_PROMPT = `You are a production coordinator for an Australian commercial photography agency.
Extract structured fields from the incoming brief or email text.

Return a JSON object with these fields (only include fields you can confidently extract).
IMPORTANT: Return raw JSON ONLY — do NOT wrap in \`\`\`json fences or markdown.

{
  "title_suggestion": string or null,    // campaign / project name, e.g. "Testing Testo Campaign"
  "shoot_location": string or null,      // venue, studio name, suburb — brief and specific
  "shoot_date_start": string or null,    // YYYY-MM-DD — the date photography/filming HAPPENS
  "shoot_date_end": string or null,      // YYYY-MM-DD — end of multi-day shoot (same as start for 1 day)
  "shoot_date_notes": string or null,    // free-text if dates unclear (e.g. "TBC", "mid-May")
  "talent_spec": string or null,         // brief description of talent needed (e.g. "Oliver Begg")
  "deliverables_type": string or null,   // e.g. "Stills + BTS Video", "eComm stills"
  "deliverables_count": number or null,  // number of final selects/images
  "usage_duration_months": number or null, // usage/licence period in months (convert weeks/years)
  "usage_territory_raw": string or null, // territory as written, e.g. "Australia" or "AU, NZ"
  "usage_media_raw": string or null,     // media as written, e.g. "POS, social, digital display"
  "budget_indication": number or null,   // numeric amount in AUD (strip currency symbols)
  "post_production_ownership": string or null, // one of: "client_in_house", "us_via_artist", "us_via_post_team", "client_outsourced"
  "grade_retouch_scope": string or null, // one of: "grade_and_retouch", "grade_only" — captures the split case (see rule 8)
  "call_time": string or null,           // HH:MM 24-hour (shoot start / call time)
  "wrap_time": string or null,           // HH:MM 24-hour (shoot finish / wrap time)
  "producer_name": string or null,       // the production contact named in the brief — NOT the email signature sender (see rule 13)
  "producer_phone": string or null,      // their phone, formatted as written
  "producer_email": string or null,      // their email, if quoted near their name

  // STRUCTURED USAGE TAXONOMY — extract IN ADDITION to usage_*_raw above:
  "usage_market": string or null,        // exactly one of: "consumer", "trade", "editorial"
  "usage_realm": string or null,         // exactly one of: "advertising", "promotional", "pr", "corporate", "editorial"
  "usage_media_categories": [string],    // any of: ["online", "broadcast", "print", "outdoor", "ambient"] — array, not single value
  "usage_specific_channels": [string],   // specific channels, snake_case, e.g. ["social_organic", "social_paid", "edm", "billboard", "pos", "press", "tv", "radio", "hoarding"]
  "usage_territory_iso": [string]        // ISO 3166-1 alpha-2 codes — e.g. ["AU", "NZ"] for "Australia and New Zealand"
}

CRITICAL RULES — read carefully:
1. TODAY is ${new Date().toISOString().slice(0, 10)}.
2. LIVE DATE ≠ SHOOT DATE. "Live Date", "Go Live", "Launch Date", "Publication Date", "OOH Date",
   "In-store from", "Air Date", "Campaign Live" ALL describe when the finished images go public —
   they are NEVER the shoot date. Do not put live dates into shoot_date_start.
3. The SHOOT DATE is when the actual photography or filming takes place. Look for phrases like
   "lock in", "confirmed for", "pencilled for", "shoot on", "shoot a [full|half] day on", "free on",
   "Shoot:", "schedule", "booked for".
4. DATE YEAR INFERENCE — when a brief gives a bare date like "22 May" with no year, pick the year
   that makes the date FUTURE OR VERY RECENT PAST (within 30 days of TODAY). DO NOT hedge with
   "could be 2025". Make a confident choice. Examples assuming TODAY = 2026-05-18:
     - "22 May"     → 2026-05-22 (4 days future)        ← confident
     - "20 May"     → 2026-05-20 (2 days past)          ← confident, too recent for next year
     - "10 April"   → 2026-04-10 (5 weeks past)         ← confident, retrospective
     - "10 February"→ 2027-02-10 (next Feb — too far in past otherwise)
   Only use shoot_date_notes when the brief explicitly says the date is TBC, tentative, "sometime in
   X", etc. A bare date without explicit caveat ALWAYS gets a confident YYYY-MM-DD answer.
5. If you find a date but cannot confidently determine it is the shoot date (vs a live/publish date),
   put it in shoot_date_notes with context, not shoot_date_start.

5b. SHOOT_LOCATION — extract the VENUE only. Do NOT prepend collection / campaign
    / brand names. "We're shooting the [Brand] Resort 2026 campaign at Salt Studio"
    → shoot_location: "Salt Studio" (the venue), NOT "Brand Resort warehouse" or
    "Resort 2026 Salt Studio". The collection name belongs in title_suggestion.
    When a brief says "at our warehouse in Marrickville (29 Carrington Rd)" the
    location is "29 Carrington Rd, Marrickville" — the brand owns the warehouse,
    but the warehouse is not named after the brand.
6. For usage_duration_months: "4 weeks" → 1 month, "6 weeks" → 2 months, "1 year" → 12 months.
7. For usage_territory_raw and usage_media_raw: copy the text verbatim from the brief. Normalise
   obvious typos in usage_territory_iso (e.g. "new zeal and" → ["NZ"], "Aus." → ["AU"]).
8. POST-PRODUCTION OWNERSHIP — IMPORTANT pronoun rule:
   The brief is ALWAYS from the client to the agency. First-person pronouns ("we",
   "us", "our", "I", "in-house") in the brief refer to the CLIENT, not the agency.
   So "retouched by us", "we'll handle post", "we will retouch in-house" all mean
   the CLIENT is doing it → "client_in_house".

   Explicit phrases:
     "we'll handle post" / "retouched by us" / "post in-house" / "we will retouch"
       → "client_in_house"  (client first-person pronouns)
     "client handles post" / "client doing post in-house"
       → "client_in_house"  (third-person reference to client)
     "the agency to handle retouch" / "you handle the retouch" / "post via your team"
       → "us_via_post_team"  (second-person "you" addressed to agency)
     "artist to retouch" / "Oliver handles post" / "the photographer will grade"
       → "us_via_artist"  (named artist or "the artist")
     "external post house" / "outsourced post" / "via [third-party] post"
       → "client_outsourced"
   If the brief is explicit, set the field. The retouching/grading split is
   common — a brief may say "graded by [artist] but retouched by us" which means
   us_via_artist (grading) AND client_in_house (retouching).

   SPLIT CASE — set BOTH post_production_ownership AND grade_retouch_scope:
     - "graded by [artist] but retouched by us" / "[artist] grading, we retouch"
       → post_production_ownership: "us_via_artist", grade_retouch_scope: "grade_only"
       Reason: the agency-side party (the artist) is doing the GRADE only;
       retouching falls to the client. Setting grade_retouch_scope explicitly
       tells the engine "scope is grade only" so we don't bill retouching
       on the artist-side workflow.
     - "graded and retouched by [artist]" / "[artist] does all post"
       → post_production_ownership: "us_via_artist", grade_retouch_scope: "grade_and_retouch"
     - "we'll handle both grade and retouch" (client = first-person)
       → post_production_ownership: "client_in_house", grade_retouch_scope is null
       (client owns everything; the scope field is moot from the agency's
       perspective).
   When only ONE side is stated explicitly, leave grade_retouch_scope null —
   the operator will fill it on the JobFacts panel post-apply.
9. TITLE SUGGESTION — extract the campaign / project / collection name ONLY when the
   brief names one explicitly. Set title_suggestion to null when:
     - The brief just says "we're putting together a shoot for X" without naming a campaign
     - The only candidate is a generic phrase like "campaign season" or "this one"
     - The brief uses the brand name + a verb ("Inaura's wrapping up") — that's not a title

   Set title_suggestion when the brief contains an explicit pattern like:
     - "For the [Brand] [Season] [Year] campaign"          → "[Brand] [Season] [Year]"
     - "X Collection SS26" / "AW26 Collection"             → "X SS26" / "AW26 Collection"
     - "[Brand] Resort 2026"                                → "[Brand] Resort 2026"
     - "[Brand] [Capsule|Drop|Project] [Name]"             → "[Brand] [Capsule|Drop] [Name]"
     - "Project [Name]"                                    → "Project [Name]"

   DO NOT hallucinate — if you're guessing, return null. The auto-generated booking
   title is fine; a wrong title is worse than a missing one.

   FASHION SEASON / COLLECTION VOCABULARY — these are SEASON NAMES, not venue or
   producer or proper-noun candidates. Recognise them and KEEP them in
   title_suggestion; do NOT mis-tag them as shoot_location or talent_spec:
     - AW / FW — Autumn-Winter / Fall-Winter (e.g. "AW26", "FW26")
     - SS — Spring-Summer (e.g. "SS27")
     - PF — Pre-Fall (e.g. "PF26")
     - Resort / Cruise — mid-season collection between PF and SS (e.g. "Resort 2026")
     - Capsule — small limited run, often collaboration-driven (e.g. "Capsule 02")
     - Pre-Spring — early-year drop
     - Drop — limited timed release (e.g. "Drop 3", "Drop SS26")
     - Holiday — late-year collection
     - Lookbook / Campaign / Editorial — collection-asset type, not a season
   Suffix convention: "[Brand] [Season] [Year]" e.g. "Aje SS26", "Venroy Resort 2026",
   "Inaura PF26 Capsule". When you see "Resort 2026" alongside a brand, that's the
   season + year, NOT a "Resort warehouse" venue.

12. CALL / WRAP TIMES — convert to HH:MM 24-hour. Triggers — pair with a clock time:
     CALL (shoot start):
       "8am start", "start at 8am", "we'll start at 8am"
       "arrive by 8am", "get there by 8am", "we'll arrive by 8am"
       "call: 8am", "call time 8am"
     WRAP (shoot finish):
       "1pm finish", "finish at 1pm", "wrapping at 1pm"
       "leave by 1pm", "head out by 1pm", "out by 1pm"
       "wrap: 5pm", "wrap at 5pm"
   Examples:
     "8am start and 1pm finish"     → call_time "08:00", wrap_time "13:00"
     "arrive by 9am and leave by 6pm" → call_time "09:00", wrap_time "18:00"
     "get there by 8 and head out by 4pm" → infer "8am" given "head out by 4pm",
       so call_time "08:00", wrap_time "16:00"
   Output strictly HH:MM 24-hour (e.g. "08:00", "13:30"). Reject if call >= wrap.
10. For budget: only include if explicitly stated as a budget/fee figure, not as a past invoice amount.
11. Only include fields you can extract with confidence. Omit nulls entirely.

13. PRODUCER CONTACT — the brief almost always names a primary production
    contact at the client/agency. Extract their name + phone + email if
    present. Variant phrasings (case-insensitive) you should recognise:

    Name-FOLLOWS-keyword:
      "The producer will be Cat Rose" / "Producer: Cat Rose"
      "On set producer: Cat Rose" / "Project lead: Cat Rose"
      "Production will be done by Cat Rose"
      "Production will be handled by Cat Rose"
      "Account exec: Cat Rose" / "Producer / Cat Rose"

    Name-PRECEDES-keyword:
      "Cat Rose will be the producer"
      "Cat Rose will be on production" / "Cat Rose heading up production"
      "Cat Rose is producing" / "Cat Rose handling production"
      "Cat Rose (Producer)" / "Cat Rose — Producer"

    Contact-following pattern:
      "her number is 0441 114 441" / "his number is …" / "you can reach
      them on …" — pair with the most recently-named producer.

    Phone formats to recognise (AU): "0441114441", "0441 114 441",
    "+61 441 114 441", "(02) 9999 9999". Return as-written (don't reformat).
    Email format: any "local@host.tld" token within the same paragraph as
    the producer mention.

    ANTI-PATTERN — do NOT treat the email signature block as the producer.
    A signature usually follows "Kind regards," / "Cheers," / "Thanks," /
    "Best,". If the only name in the brief is in the sign-off, that's the
    SENDER, not the producer. Leave producer_name null in that case.

USAGE TAXONOMY GUIDANCE:
- "Consumer" = brand selling to public. Most fashion/beauty/retail briefs.
- "Trade" = B2B (e.g. wholesale catalogues).
- "Editorial" = magazine/article/textbook (informational, not commercial).
- "Advertising" = anything that sells (ad, OOH, social campaign).
- "Promotional" = posters for an event/launch.
- "PR" = awareness-driven, not directly commercial.
- "Corporate" = annual reports, internal materials.
- Map "social and digital" → ["online"] with channels ["social_organic", "social_paid"].
- Map "eDMs" / "Emails" / "DMs" / "EDMs" → channel "edm".
- Map "OOH" / "billboards" / "out of home" → channels ["billboard"] (category "outdoor").
- Map "POS" / "window posters" / "in-store" → channels ["pos"] (category "outdoor" — point-of-sale is treated as outdoor).
- Map "earned PR" → channel "pr_earned" (category "online" — earned media doesn't fit neatly; default online).
- Map "Aus" / "Aus." / "Australia" → ["AU"]; "NZ" / "New Zealand" → ["NZ"].

TALENT_SPEC vs RECIPIENT:
- The booking is FOR the named artist (photographer/videographer/HMU). e.g. "Can I check if Oliver
  is free on 22 May" → talent_spec = "Oliver" (the agency-represented artist).
- Do NOT confuse the named artist with on-camera models. If the brief mentions both, talent_spec
  refers to the agency-represented artist who's being booked.`;

async function extractWithLLM(rawText: string, bookingId?: string): Promise<LLMBriefOutput | null> {
  return callLLMJson<LLMBriefOutput>(
    {
      purpose: 'brief_intake',
      idempotencyKey: bookingId ? `brief_intake:${bookingId}` : undefined,
      systemPrompt: BRIEF_INTAKE_SYSTEM_PROMPT,
      messages: [
        {
          role: 'user',
          content: `Please extract structured fields from this brief:\n\n---\n${rawText.slice(0, 6000)}\n---`,
        },
      ],
      maxTokens: 512,
      model: 'claude-haiku-4-5-20251001', // Cheapest model for structured extraction
      bookingId,
    },
    isLLMBriefOutput,
  );
}

// ============================================================
// Critique pass
// ============================================================

const CRITIQUE_SYSTEM_PROMPT = `You are a QA reviewer for a commercial photography agency booking system.
Given a raw brief and an extraction result, identify potential issues: fields that look wrong,
typos in extracted text, or important information that was missed.

Return a JSON array of short concern strings (max 4 items, max 80 chars each).
If no real concerns, return an empty array []. Be conservative — only flag things that an
operator would genuinely want to verify. Don't pad the list to hit 4 items.

CONFIDENT DATE INFERENCE — do NOT raise concerns about year inference. TODAY is ${new Date().toISOString().slice(0, 10)}.
A future-dated date in the current year is correct by default. Only flag dates if the brief itself
shows internal contradiction (e.g. "shoot on 22 May 2024" when TODAY is 2026 — raise it. But
"shoot on 22 May" extracted as 2026-05-22 with today in May 2026 — DO NOT flag.)

DO NOT FLAG:
- Missing fields that the extractor didn't fill — focus on what's THERE, not what's absent.
- talent_count, talent count, or "how many talent" — that field is not used.
- client_name as a separate field — clients are managed separately in the booking record.
- Year inference on dates that are sensibly in the future.

DO FLAG:
- Typos in extracted text strings (e.g. "new zeal and" → likely "New Zealand")
- Internal contradictions in the brief
- Dates that contradict each other (e.g. delivery before shoot)
- Numbers that look implausibly wrong

Example: ["Usage territory typo — 'New Zeal and' likely 'New Zealand'",
          "Delivery 27 May is before shoot 22 May — check ordering"]

Phrase each concern in plain English (not as a JSON key reference). Make each one a single
short sentence the operator can read at a glance.

CRITICAL: Return raw JSON array ONLY. Do NOT wrap in \`\`\`json fences or markdown.`;

async function critiqueBriefExtraction(
  rawText: string,
  extraction: Partial<LLMBriefOutput>,
  bookingId?: string,
): Promise<string[]> {
  const summary = Object.entries(extraction)
    .filter(([, v]) => v != null)
    .map(([k, v]) => `${k}: ${v}`)
    .join(', ') || 'No fields extracted';

  const result = await callLLM({
    purpose: 'brief_intake_critique',
    systemPrompt: CRITIQUE_SYSTEM_PROMPT,
    messages: [
      {
        role: 'user',
        content: `Brief:\n---\n${rawText.slice(0, 3000)}\n---\n\nExtracted: ${summary}\n\nWhat might be wrong?`,
      },
    ],
    maxTokens: 256,
    model: 'claude-haiku-4-5-20251001',
    bookingId,
  });

  if (!result.ok || !result.text) return [];

  // Strip markdown code fences that some models wrap JSON in. Without
  // this, JSON.parse threw and the fallback splitter treated every
  // line literally — including the ```json fence itself — and surfaced
  // it in the UI as a bullet point (audit 2026-05-18).
  const cleaned = result.text
    .trim()
    .replace(/^```(?:json)?\s*\n?/i, '')
    .replace(/\n?\s*```\s*$/i, '')
    .trim();

  try {
    const parsed = JSON.parse(cleaned);
    if (Array.isArray(parsed)) return parsed.filter((s): s is string => typeof s === 'string');
  } catch {
    // Not valid JSON even after stripping fences — extract meaningful lines.
    // Skip pure-syntax noise (fences, brackets, lone quotes).
    return cleaned
      .split('\n')
      .map((s) => s.trim().replace(/^["'`]+|["'`,]+$/g, '').trim())
      .filter((s) => s.length > 5 && s.length < 200 && !/^[`{}\[\],]+$/.test(s))
      .slice(0, 5);
  }
  return [];
}

// ============================================================
// Merge heuristic + LLM results
// ============================================================

/**
 * Identify which key fields are missing from the extraction.
 * These become uncertainty_sources surfaced in the UI.
 */
function computeUncertaintySources(merged: ParsedBrief): string[] {
  const KEY_FIELDS: Array<[keyof ParsedBrief, string]> = [
    ['shoot_date_start', 'shoot dates unclear'],
    ['shoot_location', 'location not specified'],
    // talent_count removed from surface — was producing "talent count
    // missing" concerns that Jasper didn't want.
    ['deliverables_type', 'deliverables type not specified'],
  ];
  return KEY_FIELDS
    .filter(([field]) => merged[field] == null)
    .map(([, label]) => label);
}

/**
 * Pluck the LLM's structured-usage taxonomy fields into the canonical
 * StructuredUsage shape. Defensive — the LLM may omit any of these.
 */
function pluckStructuredUsage(llm: LLMBriefOutput | null): StructuredUsage {
  if (!llm) return { ...EMPTY_STRUCTURED_USAGE };
  const MARKETS = ['consumer', 'trade', 'editorial'] as const;
  const REALMS = ['advertising', 'promotional', 'pr', 'corporate', 'editorial'] as const;
  const CATEGORIES = ['online', 'broadcast', 'print', 'outdoor', 'ambient'] as const;
  const market = MARKETS.includes(llm.usage_market as typeof MARKETS[number])
    ? (llm.usage_market as StructuredUsage['usage_market'])
    : null;
  const realm = REALMS.includes(llm.usage_realm as typeof REALMS[number])
    ? (llm.usage_realm as StructuredUsage['usage_realm'])
    : null;
  const categories = Array.isArray(llm.usage_media_categories)
    ? llm.usage_media_categories.filter((c): c is typeof CATEGORIES[number] => CATEGORIES.includes(c as typeof CATEGORIES[number]))
    : [];
  const channels = Array.isArray(llm.usage_specific_channels)
    ? llm.usage_specific_channels.filter((c): c is string => typeof c === 'string')
    : [];
  const iso = Array.isArray(llm.usage_territory_iso)
    ? llm.usage_territory_iso.filter((c): c is string => typeof c === 'string' && /^[A-Z]{2}$/.test(c))
    : [];
  return {
    usage_market: market,
    usage_realm: realm,
    usage_media_categories: categories,
    usage_specific_channels: channels,
    usage_territory_iso: iso,
  };
}

/**
 * Pluck the title_suggestion + post_production_ownership + grade_retouch_scope
 * LLM extras. Validates each enum against the allowed set; unknown values drop.
 */
function pluckExtras(llm: LLMBriefOutput | null): ExtraBriefFields {
  if (!llm) return { ...EMPTY_EXTRA_BRIEF_FIELDS };
  const POST_PROD = ['us_via_artist', 'us_via_post_team', 'client_in_house', 'client_outsourced'] as const;
  const SCOPE = ['grade_and_retouch', 'grade_only'] as const;
  const postProd = POST_PROD.includes(llm.post_production_ownership as typeof POST_PROD[number])
    ? (llm.post_production_ownership as ExtraBriefFields['post_production_ownership'])
    : null;
  const scope = SCOPE.includes(llm.grade_retouch_scope as typeof SCOPE[number])
    ? (llm.grade_retouch_scope as ExtraBriefFields['grade_retouch_scope'])
    : null;
  const title = typeof llm.title_suggestion === 'string' && llm.title_suggestion.trim().length > 0
    ? llm.title_suggestion.trim()
    : null;
  return {
    title_suggestion: title,
    post_production_ownership: postProd,
    grade_retouch_scope: scope,
  };
}

function mergeResults(heuristic: ParsedBrief, llm: LLMBriefOutput | null): BriefIntakeResult {
  if (!llm) {
    // No LLM — use heuristic alone. Structured usage + extras are LLM-only
    // (the heuristic cannot reliably extract enum-valued taxonomy), so
    // they come through empty.
    const baseFields = Object.entries(heuristic)
      .filter(([, v]) => v != null);
    const confidence = Math.min(40 + baseFields.length * 7, 72);
    const uncertainties = computeUncertaintySources(heuristic);
    return {
      ...heuristic,
      ...EMPTY_STRUCTURED_USAGE,
      ...EMPTY_EXTRA_BRIEF_FIELDS,
      source: 'heuristic',
      confidence,
      llmAvailable: false,
      uncertainty_sources: uncertainties,
      critique: [],
      contract: buildConfidenceContract<ParsedBrief>({
        output: heuristic,
        confidence,
        uncertainties,
        bestNextQuestion: bestNextQuestion(heuristic, uncertainties),
      }),
    };
  }

  // Merge: LLM wins on most fields, but validate date formats
  const merged: ParsedBrief = {
    shoot_location: llm.shoot_location ?? heuristic.shoot_location,
    shoot_date_start: validateDateStr(llm.shoot_date_start) ?? heuristic.shoot_date_start,
    shoot_date_end: validateDateStr(llm.shoot_date_end) ?? heuristic.shoot_date_end,
    shoot_date_notes: llm.shoot_date_notes ?? heuristic.shoot_date_notes,
    // talent_count: LLM no longer extracts it (removed from prompt
    // 2026-05-18). Heuristic still fills the field for backward compat
    // with old tests/fixtures, so we keep the value off the heuristic
    // alone.
    talent_count: heuristic.talent_count,
    talent_spec: llm.talent_spec ?? heuristic.talent_spec,
    call_time: llm.call_time ?? heuristic.call_time,
    wrap_time: llm.wrap_time ?? heuristic.wrap_time,
    deliverables_type: llm.deliverables_type ?? heuristic.deliverables_type,
    deliverables_count: typeof llm.deliverables_count === 'number' ? llm.deliverables_count : heuristic.deliverables_count,
    usage_duration_months: typeof llm.usage_duration_months === 'number' ? llm.usage_duration_months : heuristic.usage_duration_months,
    usage_territory_raw: llm.usage_territory_raw ?? heuristic.usage_territory_raw,
    usage_media_raw: llm.usage_media_raw ?? heuristic.usage_media_raw,
    budget_indication: typeof llm.budget_indication === 'number' ? llm.budget_indication : heuristic.budget_indication,
    // Producer fields: LLM wins when present (it understands variant
    // phrasing better than the regex). Heuristic is the safety net for
    // common patterns when ANTHROPIC_API_KEY isn't set.
    producer_name: llm.producer_name ?? heuristic.producer_name,
    producer_phone: llm.producer_phone ?? heuristic.producer_phone,
    producer_email: llm.producer_email ?? heuristic.producer_email,
  };

  const structuredUsage = pluckStructuredUsage(llm);
  const extras = pluckExtras(llm);

  const fieldsFound = Object.values(merged).filter((v) => v != null).length;
  const uncertainty_sources = computeUncertaintySources(merged);
  const confidence = Math.min(60 + fieldsFound * 5, 95);

  return {
    ...merged,
    ...structuredUsage,
    ...extras,
    source: 'merged',
    confidence,
    llmAvailable: true,
    uncertainty_sources,
    critique: [], // Populated separately in extractBriefFields
    contract: buildConfidenceContract<ParsedBrief>({
      output: merged,
      confidence,
      uncertainties: uncertainty_sources,
      bestNextQuestion: bestNextQuestion(merged, uncertainty_sources),
    }),
  };
}

function validateDateStr(d: string | undefined | null): string | null {
  if (!d) return null;
  return /^\d{4}-\d{2}-\d{2}$/.test(d) ? d : null;
}

// ============================================================
// Public API
// ============================================================

/**
 * Run the full brief intake pipeline.
 * Falls back gracefully to heuristic-only if LLM is unavailable.
 *
 * When LLM is available, runs a second critique pass that asks the model to
 * flag potential extraction issues — e.g. ambiguous dates, missing fields.
 */
export async function extractBriefFields(
  rawText: string,
  bookingId?: string,
): Promise<BriefIntakeResult> {
  // Always run heuristic (free, fast, reliable for common patterns)
  const heuristic = parseBrief(rawText);

  // Run LLM extraction if API key is available
  const llm = await extractWithLLM(rawText, bookingId).catch((err) => {
    console.error('[brief-intake] LLM extraction failed', err);
    return null;
  });

  const base = mergeResults(heuristic, llm);

  // Critique pass: only when LLM succeeded. Runs non-blocking — if it fails,
  // we return the base result with an empty critique list.
  if (llm) {
    const critique = await critiqueBriefExtraction(rawText, llm, bookingId).catch((err) => {
      console.error('[brief-intake] critique failed', err);
      return [] as string[];
    });
    return { ...base, critique };
  }

  return base;
}
