import { describe, it, expect } from 'vitest';
import { buildCsv, parseCsv, csvCell } from './csv';

describe('csvCell', () => {
  it('returns empty string for null', () => expect(csvCell(null)).toBe(''));
  it('returns plain string unchanged', () => expect(csvCell('hello')).toBe('hello'));
  it('quotes values containing commas', () => expect(csvCell('a,b')).toBe('"a,b"'));
  it('escapes embedded double-quotes', () => expect(csvCell('say "hi"')).toBe('"say ""hi"""'));
  it('formats numbers', () => expect(csvCell(42.5)).toBe('42.5'));
  it('formats booleans', () => expect(csvCell(true)).toBe('true'));
});

describe('buildCsv', () => {
  it('builds a two-row CSV', () => {
    const csv = buildCsv(['name', 'age'], [['Alice', 30], ['Bob', null]]);
    expect(csv).toBe('name,age\r\nAlice,30\r\nBob,');
  });
});

describe('parseCsv', () => {
  it('returns empty for fewer than 2 lines', () => {
    expect(parseCsv('name,email')).toHaveLength(0);
  });

  it('parses a simple two-column CSV', () => {
    const rows = parseCsv('name,email\r\nAlice,alice@x.com\r\nBob,bob@y.com');
    expect(rows).toHaveLength(2);
    expect(rows[0]).toEqual({ name: 'Alice', email: 'alice@x.com' });
    expect(rows[1]).toEqual({ name: 'Bob', email: 'bob@y.com' });
  });

  it('handles quoted fields with commas', () => {
    const rows = parseCsv('name,notes\r\n"Smith, John","Good, reliable"');
    expect(rows[0].name).toBe('Smith, John');
    expect(rows[0].notes).toBe('Good, reliable');
  });

  it('handles escaped double-quotes inside quoted fields', () => {
    const rows = parseCsv('name,notes\r\nAlice,"She said ""hi"""');
    expect(rows[0].notes).toBe('She said "hi"');
  });

  it('round-trips buildCsv → parseCsv', () => {
    const headers = ['working_name', 'discipline', 'default_day_rate'];
    const original = [['Jane Doe', 'photographer', 4000], ['Bob', 'videographer', null]];
    const csv = buildCsv(headers, original);
    const parsed = parseCsv(csv);
    expect(parsed[0].working_name).toBe('Jane Doe');
    expect(parsed[0].discipline).toBe('photographer');
    expect(parsed[0].default_day_rate).toBe('4000');
    expect(parsed[1].default_day_rate).toBe('');
  });

  it('ignores trailing blank lines', () => {
    const rows = parseCsv('name,email\r\nAlice,alice@x.com\r\n\r\n');
    expect(rows).toHaveLength(1);
  });
});
