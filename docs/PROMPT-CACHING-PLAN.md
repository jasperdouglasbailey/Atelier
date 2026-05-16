# Anthropic prompt caching — implementation plan

Drafted 2026-05-16. Not yet shipped — gated on `ANTHROPIC_API_KEY` being
provisioned in Vercel (currently still on Jasper's TODO list).

## Why this is worth doing

Every `callLLM()` invocation today re-sends a constant prefix uncached:

- `LETHAL_TRIFECTA_REFUSAL_CLAUSE` (~150–180 tokens) on **every** call
- `CRITIQUE_SYSTEM_PROMPT` on every critique call
- Brief-intake system prompt on every brief parse
- Agent house-style block on every email draft

For batch jobs (compliance pings, quote-chase cron, gallery-share cron)
that fire 10–50 calls in a single run within seconds, this prefix is
identical and the cache hit rate would be ~100%.

With prompt caching:
- Cache writes cost 1.25× input
- Cache reads cost 0.10× input
- Break-even at ~1.4 reuses within the 5-min TTL window

Crons that fan out are well above break-even from call #2 onward.
Single-shot interactive calls (manual brief parse, one-off critique) are
roughly break-even — small loss on the first call, small win if the user
triggers a follow-up within 5 min.

## What changes in code

### 1. `src/lib/integrations/anthropic.ts` — switch `system` to the blocks format

Today:
```ts
body.system = `${LETHAL_TRIFECTA_REFUSAL_CLAUSE}\n\n---\n\n${request.systemPrompt}`;
```

After:
```ts
body.system = [
  {
    type: 'text',
    text: LETHAL_TRIFECTA_REFUSAL_CLAUSE,
    cache_control: { type: 'ephemeral' },
  },
  ...(request.systemPrompt
    ? [{ type: 'text', text: request.systemPrompt, cache_control: { type: 'ephemeral' } }]
    : []),
];
```

Two cache breakpoints means:
- Tier 1: trifecta clause alone — same across every call in the whole
  app, max reuse.
- Tier 2: trifecta clause + per-purpose system prompt — same across every
  call of the same purpose, narrower reuse but bigger hit when warm.

### 2. Mind the token-minimum gotcha

Per Anthropic docs:
- **Haiku** requires ≥ 2048 tokens to be cached.
- **Sonnet / Opus** require ≥ 1024 tokens.

The trifecta clause alone is below both. So:
- For Haiku calls (the majority — critique + brief intake), the block
  only becomes cacheable when the combined `trifecta + system_prompt`
  clears 2048 tokens. The critique system prompt is ~150 tokens, so the
  combined block is still well below 2048. Caching will **silently no-op**
  for Haiku critique calls unless we deliberately bulk the prefix.
- For Sonnet / Opus (lower volume, higher per-call cost), the threshold
  is easier to hit but the call volume is lower.

**Decision:** ship the blocks-format conversion anyway. It's free for the
calls that don't meet the minimum (server just doesn't cache them) and
yields real savings on the calls that do (longer brief-intake prompts,
Sonnet/Opus paths).

### 3. Track cache metrics

Anthropic returns `usage.cache_creation_input_tokens` and
`usage.cache_read_input_tokens`. Add columns to `atelier_llm_calls`:
- `cache_creation_input_tokens int`
- `cache_read_input_tokens int`

And re-price reads at 0.10× and creates at 1.25× the model's base input
cost so monthly cost-cap accounting is accurate. Migration 0056.

### 4. Test plan

- Existing `agent-primitives.test.ts` (if any) — unchanged behaviour.
- New test: assert that the `system` field in the request body is an
  array of blocks (not a string) post-change.
- Manual: trigger two critique calls within 5 min, confirm
  `cache_read_input_tokens > 0` on the second.

## Estimated savings

Per the LLM-call log so far (when active): ~70% of calls are critique
+ brief intake on Haiku. If those calls were averaging 1500 input tokens
each and we cached ~1000 of those (the long brief-intake variant), per
batch of 10 calls:

- Uncached: 15,000 input × $0.80/M = $0.012
- With caching: 1 × 10,000 (creation, 1.25×) + 9 × 1,000 (reads, 0.10×) + 9 × 500 (uncached suffix) = $0.012 × (1.25 + 0.9 + 0.36)/15 ≈ 60% reduction

Real-world: less than that because of the Haiku 2048-token minimum, but
still meaningful. **Not** a 10× speed-up in cost; expect 30–50%.

## When to ship

Trigger: `ANTHROPIC_API_KEY` set in Vercel prod env. Until then this is
optimising a code path with zero call volume.

Estimated work: 1 hour, one PR. No user-visible UI impact.
