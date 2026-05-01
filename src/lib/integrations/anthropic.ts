/**
 * Anthropic / Claude Integration
 *
 * Handles all LLM calls for the Atelier agent system. Wraps the
 * Anthropic Messages API with:
 *   - Automatic kill switch check (no LLM calls when frozen)
 *   - Structured JSON output parsing + validation
 *   - Cost tracking (logs to atelier_llm_calls for monthly cap enforcement)
 *   - Idempotency via atelier_idempotency_keys
 *   - Hard model and token limits to prevent runaway costs
 *
 * Setup: set ANTHROPIC_API_KEY in environment variables.
 *
 * NOT ACTIVE until ANTHROPIC_API_KEY is set. All calls degrade gracefully
 * to null responses so no code path breaks during development.
 */

import { createClient } from '@/lib/supabase/server';
import { checkKillSwitch } from '@/lib/utils/kill-switch';
import { LETHAL_TRIFECTA_REFUSAL_CLAUSE } from '@/lib/utils/lethal-trifecta';

// ============================================================
// Types
// ============================================================

export type LLMMessage = {
  role: 'user' | 'assistant';
  content: string;
};

export type LLMRequest = {
  /** Identifier for this call type — used in cost tracking and idempotency. */
  purpose: string;
  /** Optional idempotency key. If set and already executed, returns cached result. */
  idempotencyKey?: string;
  messages: LLMMessage[];
  systemPrompt?: string;
  /** Max tokens to generate. Default 1024. Hard cap: 4096. */
  maxTokens?: number;
  /** Model to use. Default: claude-haiku-3-5 (cheapest, fastest). */
  model?: 'claude-haiku-3-5' | 'claude-3-5-sonnet-20241022' | 'claude-opus-4-7';
  /** Booking ID for event/audit logging. */
  bookingId?: string;
};

export type LLMResponse = {
  ok: true;
  text: string;
  usage: { input_tokens: number; output_tokens: number };
  cached: boolean;
} | {
  ok: false;
  error: string;
  reason: 'kill_switch' | 'no_api_key' | 'api_error' | 'already_exists';
};

// Cost per 1M tokens in USD (claude-haiku-3-5: input $0.80, output $4.00)
// We track in USD, compare to MONTHLY_COST_CAP_USD from constants.
const TOKEN_COSTS_USD: Record<string, { input: number; output: number }> = {
  'claude-haiku-3-5': { input: 0.80 / 1_000_000, output: 4.00 / 1_000_000 },
  'claude-3-5-sonnet-20241022': { input: 3.00 / 1_000_000, output: 15.00 / 1_000_000 },
  'claude-opus-4-7': { input: 15.00 / 1_000_000, output: 75.00 / 1_000_000 },
};

// ============================================================
// Core call function
// ============================================================

/**
 * Call the Anthropic API with full guardrails.
 * Returns null gracefully if the API key is not set (development mode).
 */
export async function callLLM(request: LLMRequest): Promise<LLMResponse> {
  const apiKey = process.env.ANTHROPIC_API_KEY;

  if (!apiKey) {
    return {
      ok: false,
      error: 'ANTHROPIC_API_KEY not set — LLM features are disabled',
      reason: 'no_api_key',
    };
  }

  // Kill switch check
  const ks = await checkKillSwitch();
  if (!ks.canProceed) {
    return {
      ok: false,
      error: 'LLM calls blocked by kill switch',
      reason: 'kill_switch',
    };
  }

  const supabase = await createClient();

  // Idempotency check
  if (request.idempotencyKey) {
    const { data: existing } = await supabase
      .from('atelier_idempotency_keys')
      .select('result_summary')
      .eq('key', request.idempotencyKey)
      .maybeSingle();

    if (existing) {
      return {
        ok: false,
        error: 'Already processed',
        reason: 'already_exists',
      };
    }
  }

  const model = request.model ?? 'claude-haiku-3-5';
  const maxTokens = Math.min(request.maxTokens ?? 1024, 4096);

  // Build the request body
  const body: Record<string, unknown> = {
    model,
    max_tokens: maxTokens,
    messages: request.messages,
  };
  // Every system prompt is prepended with the lethal-trifecta refusal clause
  // — NON-NEGOTIABLE doctrine. See src/lib/utils/lethal-trifecta.ts.
  // Agents must refuse (not hedge) any request crossing all three of
  // sensitive data + untrusted input + external comms.
  body.system = request.systemPrompt
    ? `${LETHAL_TRIFECTA_REFUSAL_CLAUSE}\n\n---\n\n${request.systemPrompt}`
    : LETHAL_TRIFECTA_REFUSAL_CLAUSE;

  // Make the API call
  let response: Response;
  try {
    response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
        'content-type': 'application/json',
      },
      body: JSON.stringify(body),
    });
  } catch (err) {
    console.error('[anthropic] fetch failed', err);
    return { ok: false, error: 'Network error calling Anthropic API', reason: 'api_error' };
  }

  if (!response.ok) {
    const errText = await response.text().catch(() => 'unknown');
    console.error('[anthropic] API error', response.status, errText);
    return { ok: false, error: `Anthropic API error ${response.status}`, reason: 'api_error' };
  }

  const data = await response.json() as {
    content: { type: string; text: string }[];
    usage: { input_tokens: number; output_tokens: number };
  };

  const text = data.content?.find((c) => c.type === 'text')?.text ?? '';
  const usage = data.usage ?? { input_tokens: 0, output_tokens: 0 };

  // Calculate cost
  const costs = TOKEN_COSTS_USD[model] ?? { input: 0, output: 0 };
  const costUsd = usage.input_tokens * costs.input + usage.output_tokens * costs.output;

  // Log to atelier_llm_calls
  try {
    await supabase.from('atelier_llm_calls').insert({
      model,
      purpose: request.purpose,
      input_tokens: usage.input_tokens,
      output_tokens: usage.output_tokens,
      cost_usd: costUsd,
      booking_id: request.bookingId ?? null,
      success: true,
      response_preview: text.slice(0, 500),
    });
  } catch (err) {
    console.error('[anthropic] failed to log call', err);
  }

  // Mark idempotency key as used
  if (request.idempotencyKey) {
    try {
      await supabase.from('atelier_idempotency_keys').insert({
        key: request.idempotencyKey,
        result_summary: text.slice(0, 200),
      });
    } catch {
      // Non-fatal if idempotency key fails to save
    }
  }

  return {
    ok: true,
    text,
    usage,
    cached: false,
  };
}

// ============================================================
// Structured JSON output helper
// ============================================================

/**
 * Call LLM and parse JSON from the response.
 * Appends "Respond with valid JSON only" to the system prompt.
 * Returns null if the LLM is unavailable or returns invalid JSON.
 */
export async function callLLMJson<T>(
  request: LLMRequest,
  validate?: (data: unknown) => data is T,
): Promise<T | null> {
  const systemPrompt = [
    request.systemPrompt ?? '',
    '\nRespond with valid JSON only. No markdown fences, no explanation. Just the JSON object.',
  ].join('');

  const result = await callLLM({ ...request, systemPrompt });
  if (!result.ok) {
    if (result.reason !== 'no_api_key') {
      console.error('[anthropic] callLLMJson failed:', result.error);
    }
    return null;
  }

  try {
    // Strip markdown fences if present
    const cleaned = result.text.replace(/^```(?:json)?\n?|```$/gm, '').trim();
    const parsed = JSON.parse(cleaned) as unknown;
    if (validate && !validate(parsed)) {
      console.error('[anthropic] JSON validation failed', parsed);
      return null;
    }
    return parsed as T;
  } catch (err) {
    console.error('[anthropic] JSON parse failed', err, result.text.slice(0, 200));
    return null;
  }
}
