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

export type BriefIntakeResult = ParsedBrief & StructuredUsage & {
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
  if (parsed.talent_count == null) {
    return 'How many talent will you need on set?';
  }
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
  talent_count: number;
  talent_spec: string;
  deliverables_type: string;
  deliverables_count: number;
  usage_duration_months: number;
  usage_territory_raw: string; // e.g. "Australia"
  usage_media_raw: string;     // e.g. "POS, social media, digital display"
  budget_indication: number;
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

Return a JSON object with these fields (only include fields you can confidently extract):
{
  "shoot_location": string or null,      // venue, studio name, suburb — brief and specific
  "shoot_date_start": string or null,    // YYYY-MM-DD — the date photography/filming HAPPENS
  "shoot_date_end": string or null,      // YYYY-MM-DD — end of multi-day shoot (same as start for 1 day)
  "shoot_date_notes": string or null,    // free-text if dates unclear (e.g. "TBC", "mid-May")
  "talent_count": number or null,        // number of MODELS/ON-CAMERA TALENT, NOT the photographer
  "talent_spec": string or null,         // brief description of talent needed
  "deliverables_type": string or null,   // e.g. "Stills + BTS Video", "eComm stills"
  "deliverables_count": number or null,  // number of final selects/images
  "usage_duration_months": number or null, // usage/licence period in months (convert weeks/years)
  "usage_territory_raw": string or null, // territory as written, e.g. "Australia" or "AU, NZ"
  "usage_media_raw": string or null,     // media as written, e.g. "POS, social, digital display"
  "budget_indication": number or null,   // numeric amount in AUD (strip currency symbols)

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
   "lock in", "confirmed for", "pencilled for", "shoot on", "shoot a [full|half] day on", "Shoot:",
   "schedule", "booked for".
4. If you find a date but cannot confidently determine it is the shoot date (vs a live/publish date),
   put it in shoot_date_notes with context, not shoot_date_start.
5. For usage_duration_months: "4 weeks" → 1 month, "6 weeks" → 2 months, "1 year" → 12 months.
6. For usage_territory_raw and usage_media_raw: copy the text verbatim from the brief where it
   appears after "Territory:" or "Media:" labels.
7. Only include fields you can extract with confidence. Omit nulls entirely.
8. For budget: only include if explicitly stated as a budget/fee figure, not as a past invoice amount.

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

TALENT COUNT vs RECIPIENT:
- If the brief is from a producer and names a photographer (e.g. "How is Dan Knott for…") and ALSO
  mentions "6 talent" or "8 models", the photographer is the BOOKING SUBJECT — do not include them
  in talent_count. talent_count = on-camera talent only.`;

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
Given a raw brief and an extraction result, identify potential issues: fields that might be wrong,
dates that seem implausible, or important information that was missed.

Return a JSON array of short concern strings (max 5 items, max 80 chars each).
If no concerns, return an empty array [].

Example: ["shoot_date_start may be ambiguous — 'next Tuesday' could be Jun 3 or Jun 10",
          "talent_count not found — brief mentions 'models' without a number"]`;

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

  try {
    const parsed = JSON.parse(result.text.trim());
    if (Array.isArray(parsed)) return parsed.filter((s): s is string => typeof s === 'string');
  } catch {
    // Not valid JSON — extract lines as concerns
    return result.text
      .split('\n')
      .map((s) => s.trim())
      .filter((s) => s.length > 5 && s.length < 120)
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
    ['talent_count', 'talent count missing'],
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

function mergeResults(heuristic: ParsedBrief, llm: LLMBriefOutput | null): BriefIntakeResult {
  if (!llm) {
    // No LLM — use heuristic alone. Structured usage fields are LLM-only
    // (the heuristic cannot reliably extract enum-valued taxonomy), so
    // they come through empty.
    const baseFields = Object.entries(heuristic)
      .filter(([, v]) => v != null);
    const confidence = Math.min(40 + baseFields.length * 7, 72);
    const uncertainties = computeUncertaintySources(heuristic);
    return {
      ...heuristic,
      ...EMPTY_STRUCTURED_USAGE,
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
    talent_count: typeof llm.talent_count === 'number' ? llm.talent_count : heuristic.talent_count,
    talent_spec: llm.talent_spec ?? heuristic.talent_spec,
    deliverables_type: llm.deliverables_type ?? heuristic.deliverables_type,
    deliverables_count: typeof llm.deliverables_count === 'number' ? llm.deliverables_count : heuristic.deliverables_count,
    usage_duration_months: typeof llm.usage_duration_months === 'number' ? llm.usage_duration_months : heuristic.usage_duration_months,
    usage_territory_raw: llm.usage_territory_raw ?? heuristic.usage_territory_raw,
    usage_media_raw: llm.usage_media_raw ?? heuristic.usage_media_raw,
    budget_indication: typeof llm.budget_indication === 'number' ? llm.budget_indication : heuristic.budget_indication,
  };

  const structuredUsage = pluckStructuredUsage(llm);

  const fieldsFound = Object.values(merged).filter((v) => v != null).length;
  const uncertainty_sources = computeUncertaintySources(merged);
  const confidence = Math.min(60 + fieldsFound * 5, 95);

  return {
    ...merged,
    ...structuredUsage,
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
