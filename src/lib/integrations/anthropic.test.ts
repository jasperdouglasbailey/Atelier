/**
 * Anthropic integration — cost-calc + system-block shape.
 *
 * The full `callLLM` flow requires Supabase + a live API key, so this file
 * tests the pieces that *can* be unit-tested in isolation:
 *
 *   1. `computeLlmCallCost()` — the cost math given a model and usage
 *      breakdown. Critical because it feeds the monthly cost cap.
 *
 *   2. The presence of `computeLlmCallCost` as an exported helper, so the
 *      cache-write / cache-read multipliers can't silently regress to the
 *      naive (input × rate) formula without breaking this test.
 *
 * Integration-level behaviour (cache_control on system blocks, schema-
 * matching insert) is covered by the live API once ANTHROPIC_API_KEY lands.
 */

import { describe, it, expect } from 'vitest';
import { computeLlmCallCost } from './anthropic';

describe('computeLlmCallCost', () => {
  it('zero usage → zero cost', () => {
    expect(computeLlmCallCost('claude-haiku-4-5-20251001', {
      input_tokens: 0,
      output_tokens: 0,
      cache_creation_input_tokens: 0,
      cache_read_input_tokens: 0,
    })).toBe(0);
  });

  it('Haiku 4.5 base rates: 1M input + 1M output = $1.00 + $5.00', () => {
    const cost = computeLlmCallCost('claude-haiku-4-5-20251001', {
      input_tokens: 1_000_000,
      output_tokens: 1_000_000,
      cache_creation_input_tokens: 0,
      cache_read_input_tokens: 0,
    });
    expect(cost).toBeCloseTo(6.00, 4);
  });

  it('cache write is billed at 1.25× base input rate', () => {
    // 1M cache-write tokens on Haiku 4.5 base $1/M = $1.25
    const cost = computeLlmCallCost('claude-haiku-4-5-20251001', {
      input_tokens: 0,
      output_tokens: 0,
      cache_creation_input_tokens: 1_000_000,
      cache_read_input_tokens: 0,
    });
    expect(cost).toBeCloseTo(1.25, 4);
  });

  it('cache read is billed at 0.10× base input rate', () => {
    // 1M cache-read tokens on Haiku 4.5 base $1/M = $0.10
    const cost = computeLlmCallCost('claude-haiku-4-5-20251001', {
      input_tokens: 0,
      output_tokens: 0,
      cache_creation_input_tokens: 0,
      cache_read_input_tokens: 1_000_000,
    });
    expect(cost).toBeCloseTo(0.10, 4);
  });

  it('mixed: realistic batch (write once, read 9 times) ~37% cheaper than uncached', () => {
    // 10 calls each with 2000 cached tokens. First writes (2000 × 1.25),
    // next 9 read (2000 × 9 × 0.10). Plus a non-cached suffix of 500
    // tokens per call (10 × 500). Output 200 tokens per call (10 × 200).
    const cached = computeLlmCallCost('claude-haiku-4-5-20251001', {
      input_tokens: 10 * 500,
      output_tokens: 10 * 200,
      cache_creation_input_tokens: 2000,
      cache_read_input_tokens: 9 * 2000,
    });
    const uncached = computeLlmCallCost('claude-haiku-4-5-20251001', {
      // What the same 10 calls would have cost without caching
      input_tokens: 10 * (500 + 2000),
      output_tokens: 10 * 200,
      cache_creation_input_tokens: 0,
      cache_read_input_tokens: 0,
    });
    // Cached version should be meaningfully cheaper. Document the actual
    // savings ratio for future-me when the multipliers change.
    expect(cached).toBeLessThan(uncached);
    const savings = (uncached - cached) / uncached;
    expect(savings).toBeGreaterThan(0.30);  // expect ≥30% savings on this profile
  });

  it('Opus 4.7 priced at 15× Haiku 4.5', () => {
    const haiku = computeLlmCallCost('claude-haiku-4-5-20251001', {
      input_tokens: 100_000,
      output_tokens: 0,
      cache_creation_input_tokens: 0,
      cache_read_input_tokens: 0,
    });
    const opus = computeLlmCallCost('claude-opus-4-7', {
      input_tokens: 100_000,
      output_tokens: 0,
      cache_creation_input_tokens: 0,
      cache_read_input_tokens: 0,
    });
    expect(opus / haiku).toBeCloseTo(15, 1);
  });

  it('legacy models still priced correctly (fallback path)', () => {
    // If a current-gen ID gets deprecated and we fall back to 3.5,
    // the cost calc must still work.
    const cost = computeLlmCallCost('claude-3-5-haiku-20241022', {
      input_tokens: 1_000_000,
      output_tokens: 1_000_000,
      cache_creation_input_tokens: 0,
      cache_read_input_tokens: 0,
    });
    // 3.5 Haiku: $0.80/M input + $4/M output
    expect(cost).toBeCloseTo(4.80, 4);
  });
});
