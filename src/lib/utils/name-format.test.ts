import { describe, expect, it } from 'vitest';
import { titleCaseName, normaliseEmail, normalisePhoneForMatch, parseDietaryDrinkFromNotes } from './name-format';

describe('titleCaseName', () => {
  it('uppercases first letter of single-word names', () => {
    expect(titleCaseName('mason')).toBe('Mason');
    expect(titleCaseName('MASON')).toBe('Mason');
  });

  it('handles multi-word names', () => {
    expect(titleCaseName('MASON MACKENZIE WOOD')).toBe('Mason Mackenzie Wood');
    expect(titleCaseName('david deas')).toBe('David Deas');
  });

  it('preserves hyphens', () => {
    expect(titleCaseName('SEOK-HO YOON')).toBe('Seok-Ho Yoon');
    expect(titleCaseName('otis burian-hodge')).toBe('Otis Burian-Hodge');
  });

  it('preserves apostrophes', () => {
    expect(titleCaseName("o'brien")).toBe("O'Brien");
    expect(titleCaseName("JOHN O'CONNOR")).toBe("John O'Connor");
  });

  it('preserves 2-letter initials that were originally all caps', () => {
    expect(titleCaseName('JP WESTLAKE')).toBe('JP Westlake');
  });

  it('returns empty string unchanged', () => {
    expect(titleCaseName('')).toBe('');
    expect(titleCaseName('   ')).toBe('');
  });
});

describe('normaliseEmail', () => {
  it('trims and lowercases', () => {
    expect(normaliseEmail('  Mason@Gmail.COM ')).toBe('mason@gmail.com');
  });
  it('returns null for empty', () => {
    expect(normaliseEmail('')).toBe(null);
    expect(normaliseEmail(null)).toBe(null);
    expect(normaliseEmail(undefined)).toBe(null);
  });
});

describe('normalisePhoneForMatch', () => {
  it('strips formatting', () => {
    expect(normalisePhoneForMatch('0435 799 397')).toBe('0435799397');
    expect(normalisePhoneForMatch('+61 435 799 397')).toBe('61435799397');
    expect(normalisePhoneForMatch('(02) 9123-4567')).toBe('0291234567');
  });
});

describe('parseDietaryDrinkFromNotes', () => {
  it('extracts both fields from pipe-separated notes', () => {
    expect(parseDietaryDrinkFromNotes('Dietary: NIL | Drink: Long black')).toEqual({
      dietary: 'NIL',
      drink_order: 'Long black',
      remainder: null,
    });
  });

  it('handles dietary only', () => {
    expect(parseDietaryDrinkFromNotes('Dietary: NIL')).toEqual({
      dietary: 'NIL',
      drink_order: null,
      remainder: null,
    });
  });

  it('handles drink only', () => {
    expect(parseDietaryDrinkFromNotes('Drink: Long black')).toEqual({
      dietary: null,
      drink_order: 'Long black',
      remainder: null,
    });
  });

  it('handles parenthesised dietary text', () => {
    expect(parseDietaryDrinkFromNotes('Dietary: NIL DIET (healthy option pls) | Drink: LB')).toEqual({
      dietary: 'NIL DIET (healthy option pls)',
      drink_order: 'LB',
      remainder: null,
    });
  });

  it('returns nulls for empty input', () => {
    expect(parseDietaryDrinkFromNotes(null)).toEqual({ dietary: null, drink_order: null, remainder: null });
    expect(parseDietaryDrinkFromNotes('')).toEqual({ dietary: null, drink_order: null, remainder: null });
  });

  it('preserves non-structured remainder', () => {
    expect(parseDietaryDrinkFromNotes('Some other note. Dietary: NIL')).toEqual({
      dietary: 'NIL',
      drink_order: null,
      remainder: 'Some other note.',
    });
  });
});
