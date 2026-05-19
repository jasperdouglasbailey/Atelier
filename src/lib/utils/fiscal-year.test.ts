import { describe, it, expect } from 'vitest';
import { currentFiscalYear, previousFiscalYear, isInFiscalYear } from './fiscal-year';

describe('currentFiscalYear', () => {
  it('Aug 2026 falls inside FY 2026/27 (starts 1 Jul 2026)', () => {
    const fy = currentFiscalYear(new Date('2026-08-15T10:00:00Z'));
    expect(fy.startISO).toBe('2026-07-01');
    expect(fy.endExclusiveISO).toBe('2027-07-01');
    expect(fy.label).toBe('FY 26/27');
  });

  it('Mar 2026 falls inside FY 2025/26 (started 1 Jul 2025)', () => {
    const fy = currentFiscalYear(new Date('2026-03-15T10:00:00Z'));
    expect(fy.startISO).toBe('2025-07-01');
    expect(fy.endExclusiveISO).toBe('2026-07-01');
    expect(fy.label).toBe('FY 25/26');
  });

  it('1 Jul is the first day of the new FY (boundary inclusive)', () => {
    const fy = currentFiscalYear(new Date('2026-07-01T00:00:00+10:00'));
    expect(fy.startISO).toBe('2026-07-01');
  });

  it('30 Jun is the last day of the old FY', () => {
    const fy = currentFiscalYear(new Date('2026-06-30T23:00:00+10:00'));
    expect(fy.startISO).toBe('2025-07-01');
  });
});

describe('previousFiscalYear', () => {
  it('returns the FY before the one containing `now`', () => {
    const prev = previousFiscalYear(new Date('2026-08-15T10:00:00Z')); // current is FY 26/27
    expect(prev.startISO).toBe('2025-07-01');
    expect(prev.endExclusiveISO).toBe('2026-07-01');
    expect(prev.label).toBe('FY 25/26');
  });
});

describe('isInFiscalYear', () => {
  const fy = currentFiscalYear(new Date('2026-08-15T10:00:00Z')); // FY 26/27

  it('includes the start date', () => {
    expect(isInFiscalYear('2026-07-01', fy)).toBe(true);
  });

  it('excludes the end date (end is exclusive)', () => {
    expect(isInFiscalYear('2027-07-01', fy)).toBe(false);
  });

  it('includes the last in-range day', () => {
    expect(isInFiscalYear('2027-06-30', fy)).toBe(true);
  });

  it('excludes a date one day before FY start', () => {
    expect(isInFiscalYear('2026-06-30', fy)).toBe(false);
  });
});
