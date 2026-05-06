/**
 * Reusable agent primitives.
 *
 * Implements the doctrine prompt-engineering rules from the master
 * CLAUDE.md (lines 154-159):
 *   1. Role with named counterparty
 *   2. House style in Jasper's voice
 *   3. Confidence contract
 *   4. Critique pass
 *   5. Precedent requirement
 *   6. Refusal clause
 *
 * These are tooling, not policy: the actual policy lives in the prompts
 * each agent assembles. This module just gives every agent the same
 * scaffolding so they don't drift.
 */

import { callLLM } from '@/lib/integrations/anthropic';

// ============================================================
// House style — Jasper's voice
// ============================================================

/**
 * Voice contract injected into every client-facing email draft. This
 * is intentionally short — the model holds it better as a list than a
 * paragraph.
 */
export const JASPER_VOICE_RULES = [
  'No "I hope this finds you well" — start with the substance.',
  'No exclamation marks in client emails. Ever.',
  'Australian English in client copy: "organisation", "colour", "realised".',
  'First-person plural ("we") for agency actions, first-person singular ("I") for personal sign-off.',
  'Sign off as: "Jasper Bailey / Saunders & Co / info@saundersandco.com.au"',
  'Plain text. No emojis. No headings. No bullet lists unless the request needs a checklist.',
  'Short sentences. Concrete numbers over vague claims.',
  'Decline if asked to fabricate testimonials, fake a review, or imply a relationship that does not exist.',
];

export function jasperVoicePromptBlock(): string {
  return [
    'House style — write as Jasper Bailey would:',
    ...JASPER_VOICE_RULES.map((r) => `- ${r}`),
  ].join('\n');
}

// ============================================================
// Critique pass — recipient simulation
// ============================================================

const CRITIQUE_SYSTEM_PROMPT = `You are roleplaying as the recipient of an email or message. Read what's been drafted, then describe in one short sentence (max 25 words) what your first reaction would be.

Return JSON:
{
  "reaction": "<your first reaction as the recipient — one sentence>",
  "is_clear": true | false,    // true ONLY if you'd know exactly what to do next
  "revision_needed": "<one specific thing to change, or empty if is_clear=true>"
}

Be honest. If the email is unclear, say so. If it buries the ask, say so.`;

export type CritiqueResult = {
  reaction: string;
  isClear: boolean;
  revisionNeeded: string;
};

/**
 * Given a draft and a recipient archetype, returns a critique. The
 * critique is a self-check: if isClear is false, the calling code
 * should regenerate the draft (up to 3x) before serving it.
 *
 * Returns null if the LLM is unavailable — caller should treat that
 * as "skip critique, ship draft as-is" since the alternative (block
 * everything) is worse than no critique.
 */
export async function critiqueDraft(input: {
  draft: string;
  recipient: string;     // e.g. "the photo-savvy buyer at a global apparel client"
  context?: string;       // e.g. "follow-up for a brief that's missing dates"
  bookingId?: string;
}): Promise<CritiqueResult | null> {
  const result = await callLLM({
    purpose: 'agent_critique',
    bookingId: input.bookingId,
    systemPrompt: CRITIQUE_SYSTEM_PROMPT,
    maxTokens: 200,
    model: 'claude-3-5-haiku-20241022',
    messages: [
      {
        role: 'user',
        content: `You are: ${input.recipient}.${input.context ? `\n\nContext: ${input.context}` : ''}\n\nThe email below has just landed in your inbox. Give your honest first-reaction critique.\n\n---\n${input.draft}\n---`,
      },
    ],
  });

  if (!result.ok) return null;

  try {
    const cleaned = result.text.replace(/^```(?:json)?\n?|```$/gm, '').trim();
    const parsed = JSON.parse(cleaned) as Partial<{ reaction: string; is_clear: boolean; revision_needed: string }>;
    if (typeof parsed.reaction !== 'string' || typeof parsed.is_clear !== 'boolean') return null;
    return {
      reaction: parsed.reaction,
      isClear: parsed.is_clear,
      revisionNeeded: parsed.revision_needed ?? '',
    };
  } catch {
    return null;
  }
}

// ============================================================
// Confidence contract
// ============================================================

export type ConfidenceContract<T> = {
  output: T;
  confidence: number;            // 0–100
  uncertainties: string[];       // up to 2 biggest unknowns
  /** If confidence < 85, the single question that would most raise it. */
  bestNextQuestion: string | null;
};

/**
 * Wrap any agent output with a self-reported confidence contract.
 * This is the doctrine "if confidence < 85, propose the question that
 * would most raise it instead of just answering" pattern.
 *
 * The agent prompt should ask the LLM to return:
 *   { "result": ..., "confidence": <number>, "uncertainties": [...],
 *     "best_next_question": "..." }
 *
 * This helper just normalises the shape and clamps the confidence.
 */
export function buildConfidenceContract<T>(input: {
  output: T;
  confidence: number;
  uncertainties: string[];
  bestNextQuestion?: string | null;
}): ConfidenceContract<T> {
  const clamped = Math.max(0, Math.min(100, Math.round(input.confidence)));
  return {
    output: input.output,
    confidence: clamped,
    uncertainties: input.uncertainties.slice(0, 2),
    bestNextQuestion: clamped < 85 ? (input.bestNextQuestion ?? null) : null,
  };
}

// ============================================================
// Precedent requirement helpers
// ============================================================

/**
 * Format a precedent line for inclusion in a prompt. The doctrine says
 * agents must cite 1-3 prior bookings for every recommendation; this
 * helper just standardises the citation format so the model gets a
 * predictable shape.
 */
export function formatPrecedentCitation(precedent: {
  bookingRef: string | null;
  tier: string;
  dayRate?: number;
  grandTotal?: number;
  outcome?: string;
}): string {
  const parts: string[] = [];
  parts.push(precedent.bookingRef ?? 'unref');
  parts.push(precedent.tier);
  if (precedent.dayRate) parts.push(`$${precedent.dayRate}/day`);
  if (precedent.grandTotal) parts.push(`$${precedent.grandTotal} total`);
  if (precedent.outcome) parts.push(precedent.outcome);
  return parts.join(' · ');
}
