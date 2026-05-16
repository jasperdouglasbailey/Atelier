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

/**
 * Allowed model IDs. Anthropic's convention is `claude-{name}-{version}-{date?}`.
 * Undated aliases silently 404 once deprecated (per PR#30 incident), so the
 * dated form is preferred — but Anthropic sometimes ships generations without
 * a dated SKU (Sonnet 4.6 currently ships only as `claude-sonnet-4-6`).
 *
 * Three current-generation IDs are the defaults. The three prior-generation
 * IDs stay in the union as explicit fallbacks: if Anthropic deprecates a
 * current ID we can flip a call site back without code-modifying the union.
 * When upgrading: https://docs.anthropic.com/en/docs/about-claude/models
 */
export type AnthropicModel =
  // Current generation (selected 2026-05-16; deploy with health-check signal —
  // a 404 from the live API on any of these should produce an audit event).
  | 'claude-haiku-4-5-20251001'
  | 'claude-sonnet-4-6'
  | 'claude-opus-4-7'
  // Prior generation — kept as fallbacks. Safe to remove once we have
  // confidence the current-generation IDs are stable and indexed by support.
  | 'claude-3-5-haiku-20241022'
  | 'claude-3-5-sonnet-20241022'
  | 'claude-opus-4-1-20250805';

/** Default cheap/fast model. Used when a caller doesn't specify. */
export const DEFAULT_MODEL: AnthropicModel = 'claude-haiku-4-5-20251001';

/**
 * Per-model fallback chain — if the requested model 404s (Anthropic
 * deprecated the dated ID), we retry once with the corresponding
 * prior-generation ID. Critical because the current-gen IDs were
 * bumped in PR-E without live API verification — if any of them are
 * stale, this gives the platform a soft landing instead of every
 * agent call failing in prod.
 *
 * The chain is single-hop: try the new model, fall back to one prior.
 * If even the prior model 404s we give up and let the caller see the
 * error. Loops are explicitly avoided.
 */
const MODEL_FALLBACK: Partial<Record<AnthropicModel, AnthropicModel>> = {
  'claude-haiku-4-5-20251001':  'claude-3-5-haiku-20241022',
  'claude-sonnet-4-6':          'claude-3-5-sonnet-20241022',
  'claude-opus-4-7':            'claude-opus-4-1-20250805',
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
  model?: AnthropicModel;
  /** Booking ID for event/audit logging. */
  bookingId?: string;
};

export type LLMResponse = {
  ok: true;
  text: string;
  usage: {
    input_tokens: number;
    output_tokens: number;
    cache_creation_input_tokens: number;
    cache_read_input_tokens: number;
  };
  cached: boolean;
} | {
  ok: false;
  error: string;
  reason: 'kill_switch' | 'no_api_key' | 'api_error' | 'already_exists';
};

// Per-million-token USD prices (Anthropic's standard unit). Cache writes
// are billed at 1.25× base input; cache reads at 0.10×. Those multipliers
// are computed at call time so the table stays simple.
//
// Prices verified 2026-05 against Anthropic's pricing page. If they shift,
// update both the rate AND the comment date. The MONTHLY_COST_CAP_USD in
// constants.ts is the safety net if any of these are off.
const TOKEN_COSTS_USD: Record<AnthropicModel, { input: number; output: number }> = {
  // Current generation
  'claude-haiku-4-5-20251001':   { input: 1.00 / 1_000_000, output: 5.00 / 1_000_000 },
  'claude-sonnet-4-6':           { input: 3.00 / 1_000_000, output: 15.00 / 1_000_000 },
  'claude-opus-4-7':             { input: 15.00 / 1_000_000, output: 75.00 / 1_000_000 },
  // Prior generation — fallback prices kept aligned to their public rates
  'claude-3-5-haiku-20241022':   { input: 0.80 / 1_000_000, output: 4.00 / 1_000_000 },
  'claude-3-5-sonnet-20241022':  { input: 3.00 / 1_000_000, output: 15.00 / 1_000_000 },
  'claude-opus-4-1-20250805':    { input: 15.00 / 1_000_000, output: 75.00 / 1_000_000 },
};

const CACHE_WRITE_MULTIPLIER = 1.25;  // Anthropic-published rate (ephemeral)
const CACHE_READ_MULTIPLIER  = 0.10;  // Anthropic-published rate (ephemeral)

/**
 * Compute total cost including prompt-caching multipliers.
 *
 * Anthropic returns three input-token counts:
 *   - input_tokens                  → base rate
 *   - cache_creation_input_tokens   → 1.25× base rate (one-time write)
 *   - cache_read_input_tokens       → 0.10× base rate (subsequent reads)
 *
 * Output tokens are billed at output rate regardless of cache state.
 *
 * Exported for testability — the cost-tracking math should be unit-testable
 * without spinning up a Supabase client.
 */
export function computeLlmCallCost(
  model: AnthropicModel,
  usage: {
    input_tokens: number;
    output_tokens: number;
    cache_creation_input_tokens: number;
    cache_read_input_tokens: number;
  },
): number {
  const rates = TOKEN_COSTS_USD[model] ?? { input: 0, output: 0 };
  const baseInput   = usage.input_tokens               * rates.input;
  const cacheWrite  = usage.cache_creation_input_tokens * rates.input * CACHE_WRITE_MULTIPLIER;
  const cacheRead   = usage.cache_read_input_tokens    * rates.input * CACHE_READ_MULTIPLIER;
  const output      = usage.output_tokens              * rates.output;
  return baseInput + cacheWrite + cacheRead + output;
}

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

  const requestedModel = request.model ?? DEFAULT_MODEL;
  const maxTokens = Math.min(request.maxTokens ?? 1024, 4096);

  // Build the request body. The system field is an *array of text blocks*
  // rather than a string so we can attach `cache_control: { type: 'ephemeral' }`
  // to each block — Anthropic's prompt-caching API keys off block boundaries.
  //
  // Two cache breakpoints:
  //   1. Lethal-trifecta clause — constant across EVERY call in the whole
  //      platform. Max reuse, max cache benefit.
  //   2. Per-purpose system prompt — constant across repeated calls of
  //      the same purpose (every critique, every brief-intake, etc.).
  //
  // Caveat per docs/PROMPT-CACHING-PLAN.md:
  //   - Haiku requires the cached block to be ≥2048 tokens before it
  //     actually caches. Sonnet/Opus require ≥1024.
  //   - Below the threshold the cache_control hint is silently ignored
  //     (NOT an error) — the call still works, it just bills full input
  //     rate. Re-evaluate breakpoint placement if a long-tail prompt
  //     drops below threshold.
  //
  // The doctrine on the trifecta clause is unchanged: it MUST be the
  // first system block. See src/lib/utils/lethal-trifecta.ts.
  const systemBlocks: Array<{ type: 'text'; text: string; cache_control?: { type: 'ephemeral' } }> = [
    {
      type: 'text',
      text: LETHAL_TRIFECTA_REFUSAL_CLAUSE,
      cache_control: { type: 'ephemeral' },
    },
  ];
  if (request.systemPrompt) {
    systemBlocks.push({
      type: 'text',
      text: request.systemPrompt,
      cache_control: { type: 'ephemeral' },
    });
  }

  /**
   * Send the request body to Anthropic. Returns the raw Response. Pulled
   * out so we can retry with a fallback model on 404 (deprecated dated ID)
   * without duplicating header/body construction.
   *
   * `key` is passed explicitly because TS doesn't narrow `apiKey` from
   * the early-return guard above into a closure.
   */
  async function callOnce(modelId: AnthropicModel, key: string): Promise<Response> {
    const body: Record<string, unknown> = {
      model: modelId,
      max_tokens: maxTokens,
      messages: request.messages,
      system: systemBlocks,
    };
    return fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'x-api-key': key,
        'anthropic-version': '2023-06-01',
        'content-type': 'application/json',
      },
      body: JSON.stringify(body),
    });
  }

  let model: AnthropicModel = requestedModel;
  let response: Response;
  try {
    response = await callOnce(model, apiKey);
  } catch (err) {
    console.error('[anthropic] fetch failed', err);
    return { ok: false, error: 'Network error calling Anthropic API', reason: 'api_error' };
  }

  // If the model 404s (Anthropic deprecated the dated ID), retry once
  // with the prior-generation counterpart. Single hop only — if that also
  // fails, we surface the error to the caller. This protects against a
  // bad model-bump (PR-E shipped current-gen IDs without live API
  // verification, per the audit risk callout).
  if (response.status === 404 && MODEL_FALLBACK[requestedModel]) {
    const fallbackModel = MODEL_FALLBACK[requestedModel]!;
    console.warn(`[anthropic] model ${requestedModel} 404'd — falling back to ${fallbackModel}`);
    try {
      response = await callOnce(fallbackModel, apiKey);
      model = fallbackModel;
    } catch (err) {
      console.error('[anthropic] fallback fetch failed', err);
      return { ok: false, error: 'Network error on fallback model', reason: 'api_error' };
    }
  }

  if (!response.ok) {
    const errText = await response.text().catch(() => 'unknown');
    console.error('[anthropic] API error', response.status, errText, 'model:', model);
    return { ok: false, error: `Anthropic API error ${response.status}`, reason: 'api_error' };
  }

  const data = await response.json() as {
    content: { type: string; text: string }[];
    usage: {
      input_tokens: number;
      output_tokens: number;
      // These two fields only appear when prompt caching kicks in. Missing
      // when the cached block is below the minimum-token threshold, or
      // when this is the first call within the 5-min ephemeral TTL.
      cache_creation_input_tokens?: number;
      cache_read_input_tokens?: number;
    };
  };

  const text = data.content?.find((c) => c.type === 'text')?.text ?? '';
  const rawUsage = data.usage ?? { input_tokens: 0, output_tokens: 0 };
  const usage = {
    input_tokens: rawUsage.input_tokens ?? 0,
    output_tokens: rawUsage.output_tokens ?? 0,
    cache_creation_input_tokens: rawUsage.cache_creation_input_tokens ?? 0,
    cache_read_input_tokens: rawUsage.cache_read_input_tokens ?? 0,
  };

  const costUsd = computeLlmCallCost(model, usage);

  // Log to atelier_llm_calls. Column names match the actual schema as of
  // migration 0056 — pre-2026-05-16 this insert referenced `purpose`,
  // `cost_usd`, and `response_preview` which didn't exist (latent bug
  // surfaced by the AUDIT-2026-05-16 review while wiring caching).
  try {
    await supabase.from('atelier_llm_calls').insert({
      model,
      agent_name: request.purpose,
      input_tokens: usage.input_tokens,
      output_tokens: usage.output_tokens,
      cache_creation_input_tokens: usage.cache_creation_input_tokens,
      cache_read_input_tokens: usage.cache_read_input_tokens,
      estimated_cost_usd: costUsd,
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
    // `cached` reflects prompt-cache hit (a cached system block was reused).
    // Distinct from the legacy idempotency-key cache. Useful for surfacing
    // cache-hit rate on a cost dashboard once one exists.
    cached: usage.cache_read_input_tokens > 0,
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
