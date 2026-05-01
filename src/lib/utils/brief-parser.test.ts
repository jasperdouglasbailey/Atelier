/**
 * Brief Parser Tests
 *
 * The heuristic parser extracts structured fields from raw brief/email text.
 * It runs even without an LLM, so its accuracy directly affects how much
 * Jasper has to type. These tests cover the realistic patterns seen in
 * Sydney commercial photography briefs.
 */

import { describe, it, expect } from 'vitest';
import { parseBrief } from './brief-parser';

describe('parseBrief — empty input', () => {
  it('returns all-null result for empty string', () => {
    const r = parseBrief('');
    expect(r.shoot_location).toBeNull();
    expect(r.shoot_date_start).toBeNull();
    expect(r.budget_indication).toBeNull();
  });

  it('returns all-null for whitespace-only input', () => {
    expect(parseBrief('   \n  \t').shoot_date_start).toBeNull();
  });
});

describe('parseBrief — dates', () => {
  it('parses a single "15 May 2026" date', () => {
    const r = parseBrief('Shoot date: 15 May 2026');
    expect(r.shoot_date_start).toBe('2026-05-15');
    expect(r.shoot_date_end).toBe('2026-05-15');
  });

  it('parses a date range "15–17 May 2026" (en dash)', () => {
    const r = parseBrief('Shoot dates: 15–17 May 2026');
    expect(r.shoot_date_start).toBe('2026-05-15');
    expect(r.shoot_date_end).toBe('2026-05-17');
  });

  it('parses a date range "15-17 May 2026" (hyphen)', () => {
    const r = parseBrief('Shoot dates: 15-17 May 2026');
    expect(r.shoot_date_start).toBe('2026-05-15');
    expect(r.shoot_date_end).toBe('2026-05-17');
  });

  it('parses numeric date "15/05/2026"', () => {
    const r = parseBrief('Date: 15/05/2026');
    expect(r.shoot_date_start).toBe('2026-05-15');
  });

  it('captures "TBC" as date_notes when dates unparseable', () => {
    const r = parseBrief('Shoot date: TBC, likely mid-May');
    expect(r.shoot_date_start).toBeNull();
    expect(r.shoot_date_notes).toBe('TBC');
  });

  it('falls back to scanning whole text when no "Date:" label', () => {
    const r = parseBrief('We need photography on 20 June 2026 in Sydney.');
    expect(r.shoot_date_start).toBe('2026-06-20');
  });

  it('rejects out-of-range years (sanity check)', () => {
    const r = parseBrief('Date: 15 May 1999');
    expect(r.shoot_date_start).toBeNull();
  });

  it('rejects impossible day (32)', () => {
    const r = parseBrief('Date: 32 May 2026');
    expect(r.shoot_date_start).toBeNull();
  });
});

describe('parseBrief — budget', () => {
  it('extracts $4,250 budget', () => {
    const r = parseBrief('Budget: $4,250 for the day');
    expect(r.budget_indication).toBe(4250);
  });

  it('extracts budget with cents', () => {
    const r = parseBrief('Total fee: $5,500.50');
    expect(r.budget_indication).toBe(5500.5);
  });

  it('rejects unrealistic budgets (under $500)', () => {
    const r = parseBrief('Coffee budget $50');
    expect(r.budget_indication).toBeNull();
  });

  it('rejects unrealistic budgets (over $500k)', () => {
    const r = parseBrief('Budget $1,000,000');
    expect(r.budget_indication).toBeNull();
  });

  it('falls back to bare $ amount if no keyword', () => {
    const r = parseBrief('We can do $3,500 all in.');
    expect(r.budget_indication).toBe(3500);
  });
});

describe('parseBrief — location', () => {
  it('extracts "Location: Studio 5"', () => {
    const r = parseBrief('Location: Studio 5, Surry Hills');
    expect(r.shoot_location).toContain('Studio 5');
  });

  it('extracts "@ Studio 5"', () => {
    const r = parseBrief('We\'ll shoot @ Studio 5 in Alexandria');
    expect(r.shoot_location).toContain('Studio 5');
  });
});

describe('parseBrief — talent', () => {
  it('extracts "3 models"', () => {
    const r = parseBrief('We need 3 models for the day.');
    expect(r.talent_count).toBe(3);
  });

  it('extracts "talent: 2"', () => {
    const r = parseBrief('Talent: 2');
    expect(r.talent_count).toBe(2);
  });

  it('synthesises talent_spec from count + gender', () => {
    const r = parseBrief('Looking for 2 female models');
    expect(r.talent_count).toBe(2);
    expect(r.talent_spec?.toLowerCase()).toContain('female');
  });

  it('rejects implausible talent counts (>50)', () => {
    const r = parseBrief('We need 500 models');
    expect(r.talent_count).toBeNull();
  });
});

describe('parseBrief — deliverables', () => {
  it('detects stills + video + BTS', () => {
    const r = parseBrief('Deliverables: Stills + Video + BTS');
    expect(r.deliverables_type).toContain('Stills');
    expect(r.deliverables_type).toContain('Video');
    expect(r.deliverables_type).toContain('BTS');
  });

  it('detects eComm packshots', () => {
    const r = parseBrief('eComm packshot stills');
    expect(r.deliverables_type).toContain('eComm');
  });

  it('extracts deliverables count "20 hero images"', () => {
    const r = parseBrief('We need 20 hero images delivered');
    expect(r.deliverables_count).toBe(20);
  });
});

describe('parseBrief — usage duration', () => {
  it('parses "12 months usage"', () => {
    const r = parseBrief('Usage: 12 months');
    expect(r.usage_duration_months).toBe(12);
  });

  it('parses "2 years usage" → 24 months', () => {
    const r = parseBrief('2 years usage rights');
    expect(r.usage_duration_months).toBe(24);
  });

  it('parses bare "1 year" without keyword', () => {
    const r = parseBrief('Photography for a 1 year campaign');
    expect(r.usage_duration_months).toBe(12);
  });
});

// ============================================================
// Realistic end-to-end brief
// ============================================================

describe('parseBrief — realistic end-to-end', () => {
  const realBrief = `
Hi Jasper,

We're looking to book a shoot for the new AJE eComm range.

Shoot dates: 15–17 May 2026
Location: Studio 5, Alexandria
Talent: 3 female models
Deliverables: Stills + BTS Video, 30 hero images
Usage: 12 months Australia social + paid media
Budget: $25,000 all in.

Cheers,
Sarah
`.trim();

  it('extracts date range', () => {
    const r = parseBrief(realBrief);
    expect(r.shoot_date_start).toBe('2026-05-15');
    expect(r.shoot_date_end).toBe('2026-05-17');
  });

  it('extracts location', () => {
    const r = parseBrief(realBrief);
    expect(r.shoot_location).toContain('Studio 5');
  });

  it('extracts talent count and spec', () => {
    const r = parseBrief(realBrief);
    expect(r.talent_count).toBe(3);
    expect(r.talent_spec?.toLowerCase()).toContain('female');
  });

  it('extracts deliverables', () => {
    const r = parseBrief(realBrief);
    expect(r.deliverables_type).toContain('Stills');
    expect(r.deliverables_type).toContain('BTS');
    expect(r.deliverables_count).toBe(30);
  });

  it('extracts usage', () => {
    const r = parseBrief(realBrief);
    expect(r.usage_duration_months).toBe(12);
  });

  it('extracts budget', () => {
    const r = parseBrief(realBrief);
    expect(r.budget_indication).toBe(25000);
  });
});
