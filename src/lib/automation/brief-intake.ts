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
import { callLLMJson } from '@/lib/integrations/anthropic';

// ============================================================
// Types
// ============================================================

export type BriefIntakeResult = ParsedBrief & {
  source: 'heuristic' | 'llm' | 'merged';
  confidence: number; // 0–100
  llmAvailable: boolean;
};

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
  budget_indication: number;
}>;

function isLLMBriefOutput(v: unknown): v is LLMBriefOutput {
  return typeof v === 'object' && v !== null;
}

const BRIEF_INTAKE_SYSTEM_PROMPT = `You are a production coordinator for an Australian commercial photography agency.
Extract structured fields from the incoming brief or email text.

Return a JSON object with these fields (only include fields you can confidently extract):
{
  "shoot_location": string or null,      // venue, studio name, suburb — brief and specific
  "shoot_date_start": string or null,    // YYYY-MM-DD format
  "shoot_date_end": string or null,      // YYYY-MM-DD format (same as start for single day)
  "shoot_date_notes": string or null,    // free-text if dates are unclear (e.g. "TBC", "mid-May")
  "talent_count": number or null,        // number of models/talent required
  "talent_spec": string or null,         // brief description of talent needed
  "deliverables_type": string or null,   // e.g. "Stills + BTS Video", "eComm stills"
  "deliverables_count": number or null,  // number of final selects/images
  "usage_duration_months": number or null, // usage period in months (convert years to months)
  "budget_indication": number or null    // numeric amount in AUD (strip currency symbols)
}

Rules:
- Today's date is ${new Date().toISOString().slice(0, 10)}
- Only include fields you can extract with reasonable confidence
- For dates: if a range is mentioned, set shoot_date_start and shoot_date_end
- For budget: only include if explicitly stated as a budget/fee figure, not as a past invoice
- For talent: "3 models" → talent_count: 3, talent_spec: "3 models"
- Convert all durations to months (1 year = 12 months, 2 years = 24 months)
- If a field is unclear or absent, omit it from the response (don't include nulls)`;

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
      model: 'claude-haiku-3-5', // Cheapest model for structured extraction
      bookingId,
    },
    isLLMBriefOutput,
  );
}

// ============================================================
// Merge heuristic + LLM results
// ============================================================

function mergeResults(heuristic: ParsedBrief, llm: LLMBriefOutput | null): BriefIntakeResult {
  if (!llm) {
    // No LLM — use heuristic alone
    const fieldsFound = Object.values(heuristic).filter((v) => v != null).length;
    return {
      ...heuristic,
      source: 'heuristic',
      confidence: Math.min(40 + fieldsFound * 8, 75),
      llmAvailable: false,
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
    budget_indication: typeof llm.budget_indication === 'number' ? llm.budget_indication : heuristic.budget_indication,
  };

  const fieldsFound = Object.values(merged).filter((v) => v != null).length;
  return {
    ...merged,
    source: 'merged',
    confidence: Math.min(60 + fieldsFound * 5, 95),
    llmAvailable: true,
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
 */
export async function extractBriefFields(
  rawText: string,
  bookingId?: string,
): Promise<BriefIntakeResult> {
  // Always run heuristic (free, fast, reliable for common patterns)
  const heuristic = parseBrief(rawText);

  // Run LLM extraction if API key is available
  // Errors are caught inside callLLMJson — null means LLM unavailable
  const llm = await extractWithLLM(rawText, bookingId).catch((err) => {
    console.error('[brief-intake] LLM extraction failed', err);
    return null;
  });

  return mergeResults(heuristic, llm);
}
