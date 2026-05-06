/**
 * Tests for the pure precedent-stat helpers.
 *
 * The aggregate stats here drive the doctrine-critical confidence
 * buckets (n<3 = low, etc). Locking these via test means future
 * refactors can't silently shift the threshold.
 */

import { describe, it, expect } from 'vitest';
import { bandStats } from './precedents';
import { bucketConfidence, CONFIDENCE_THRESHOLDS } from '@/lib/utils/constants';

describe('bandStats', () => {
  it('returns null for empty input', () => {
    expect(bandStats([])).toBeNull();
  });

  it('handles a single rate (low confidence)', () => {
    const result = bandStats([1500]);
    expect(result).toEqual({
      count: 1,
      min: 1500,
      median: 1500,
      max: 1500,
      avg: 1500,
      confidence: 'low',
    });
  });

  it('handles 3 rates (ok confidence, exact threshold)', () => {
    const result = bandStats([1000, 2000, 3000]);
    expect(result?.confidence).toBe('ok');
    expect(result?.median).toBe(2000);
    expect(result?.avg).toBe(2000);
    expect(result?.min).toBe(1000);
    expect(result?.max).toBe(3000);
  });

  it('handles 10+ rates (strong confidence, exact threshold)', () => {
    const rates = Array.from({ length: 10 }, (_, i) => 1000 + i * 100);
    const result = bandStats(rates);
    expect(result?.confidence).toBe('strong');
    expect(result?.count).toBe(10);
  });

  it('computes median for an even number of values', () => {
    // sorted: [1000, 2000, 3000, 4000] — median is (2000+3000)/2 = 2500
    expect(bandStats([3000, 1000, 4000, 2000])?.median).toBe(2500);
  });

  it('computes median for an odd number of values', () => {
    // sorted: [1000, 2000, 3000] — median is 2000
    expect(bandStats([3000, 1000, 2000])?.median).toBe(2000);
  });

  it('does not mutate the input array', () => {
    const input = [3000, 1000, 2000];
    const snapshot = [...input];
    bandStats(input);
    expect(input).toEqual(snapshot);
  });
});

describe('bucketConfidence', () => {
  it('returns "low" for n below threshold', () => {
    expect(bucketConfidence(0)).toBe('low');
    expect(bucketConfidence(1)).toBe('low');
    expect(bucketConfidence(CONFIDENCE_THRESHOLDS.ok - 1)).toBe('low');
  });

  it('returns "ok" between thresholds', () => {
    expect(bucketConfidence(CONFIDENCE_THRESHOLDS.ok)).toBe('ok');
    expect(bucketConfidence(CONFIDENCE_THRESHOLDS.strong - 1)).toBe('ok');
  });

  it('returns "strong" at and above the strong threshold', () => {
    expect(bucketConfidence(CONFIDENCE_THRESHOLDS.strong)).toBe('strong');
    expect(bucketConfidence(CONFIDENCE_THRESHOLDS.strong + 50)).toBe('strong');
  });
});
