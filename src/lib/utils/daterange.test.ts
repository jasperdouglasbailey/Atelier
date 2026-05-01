/**
 * Daterange Round-Trip Tests
 *
 * Postgres `daterange` has an inclusive lower bound and EXCLUSIVE upper
 * bound. We have to convert in both directions: form → range (add 1 day),
 * range → form (subtract 1 day). Get this wrong and every multi-day shoot
 * silently ends a day early. These tests lock the round-trip.
 */

import { describe, it, expect } from 'vitest';
import { buildDateRange, dateRangeToInputs, parseDateRangeRaw } from './daterange';

// ============================================================
// buildDateRange
// ============================================================

describe('buildDateRange', () => {
  it('single-day shoot: end exclusive = start + 1', () => {
    expect(buildDateRange('2026-05-15', '2026-05-15')).toBe('[2026-05-15,2026-05-16)');
  });

  it('three-day shoot 15→17 stored as [15,18)', () => {
    expect(buildDateRange('2026-05-15', '2026-05-17')).toBe('[2026-05-15,2026-05-18)');
  });

  it('null start returns null', () => {
    expect(buildDateRange(null, null)).toBeNull();
    expect(buildDateRange(null, '2026-05-17')).toBeNull();
  });

  it('null end defaults to start (single-day)', () => {
    expect(buildDateRange('2026-05-15', null)).toBe('[2026-05-15,2026-05-16)');
  });

  it('crosses month boundary correctly: May 31 → Jun 1', () => {
    expect(buildDateRange('2026-05-31', '2026-05-31')).toBe('[2026-05-31,2026-06-01)');
  });

  it('crosses year boundary correctly: Dec 31 → Jan 1', () => {
    expect(buildDateRange('2025-12-31', '2025-12-31')).toBe('[2025-12-31,2026-01-01)');
  });

  it('handles leap day: Feb 29 → Mar 1 in leap year', () => {
    expect(buildDateRange('2024-02-29', '2024-02-29')).toBe('[2024-02-29,2024-03-01)');
  });

  it('handles non-leap Feb: Feb 28 → Mar 1', () => {
    expect(buildDateRange('2025-02-28', '2025-02-28')).toBe('[2025-02-28,2025-03-01)');
  });
});

// ============================================================
// dateRangeToInputs (for form display)
// ============================================================

describe('dateRangeToInputs', () => {
  it('single-day [15,16) → { start: 15, end: 15 }', () => {
    expect(dateRangeToInputs('[2026-05-15,2026-05-16)')).toEqual({
      start: '2026-05-15',
      end: '2026-05-15',
    });
  });

  it('three-day [15,18) → { start: 15, end: 17 }', () => {
    expect(dateRangeToInputs('[2026-05-15,2026-05-18)')).toEqual({
      start: '2026-05-15',
      end: '2026-05-17',
    });
  });

  it('null/empty input returns empty strings', () => {
    expect(dateRangeToInputs(null)).toEqual({ start: '', end: '' });
    expect(dateRangeToInputs('')).toEqual({ start: '', end: '' });
    expect(dateRangeToInputs(undefined)).toEqual({ start: '', end: '' });
  });

  it('malformed input returns empty strings', () => {
    expect(dateRangeToInputs('not-a-range')).toEqual({ start: '', end: '' });
  });

  it('crosses month boundary: [May 31, Jun 1) → end stays May 31', () => {
    expect(dateRangeToInputs('[2026-05-31,2026-06-01)')).toEqual({
      start: '2026-05-31',
      end: '2026-05-31',
    });
  });

  it('crosses year boundary: [Dec 31, Jan 1) → end stays Dec 31', () => {
    expect(dateRangeToInputs('[2025-12-31,2026-01-01)')).toEqual({
      start: '2025-12-31',
      end: '2025-12-31',
    });
  });
});

// ============================================================
// Round-trip — the property test
// ============================================================

describe('round-trip: build → parse → build is stable', () => {
  const cases: [string, string][] = [
    ['2026-05-15', '2026-05-15'],   // single day
    ['2026-05-15', '2026-05-17'],   // 3-day
    ['2026-05-31', '2026-06-02'],   // crosses month
    ['2025-12-30', '2026-01-02'],   // crosses year
    ['2024-02-28', '2024-03-01'],   // crosses leap-year Feb
    ['2026-01-01', '2026-12-31'],   // full year
  ];

  for (const [start, end] of cases) {
    it(`${start} → ${end}`, () => {
      const range = buildDateRange(start, end);
      expect(range).not.toBeNull();
      const parsed = dateRangeToInputs(range);
      expect(parsed.start).toBe(start);
      expect(parsed.end).toBe(end);
      // Build it again — should produce identical literal
      expect(buildDateRange(parsed.start, parsed.end)).toBe(range);
    });
  }
});

// ============================================================
// parseDateRangeRaw (preserves exclusive end)
// ============================================================

describe('parseDateRangeRaw', () => {
  it('preserves exclusive upper bound (no -1 day)', () => {
    expect(parseDateRangeRaw('[2026-05-15,2026-05-18)')).toEqual({
      start: '2026-05-15',
      end: '2026-05-18',
    });
  });

  it('null input returns nulls (not empty strings)', () => {
    expect(parseDateRangeRaw(null)).toEqual({ start: null, end: null });
  });

  it('returns nulls for malformed input', () => {
    expect(parseDateRangeRaw('garbage')).toEqual({ start: null, end: null });
  });
});
