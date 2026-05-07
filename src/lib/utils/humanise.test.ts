import { describe, it, expect } from 'vitest';
import { humanise, humaniseList } from './humanise';

describe('humanise', () => {
  it('handles null / undefined / empty safely', () => {
    expect(humanise(null)).toBe('');
    expect(humanise(undefined)).toBe('');
    expect(humanise('')).toBe('');
    expect(humanise('   ')).toBe('');
  });

  it('snake_case → sentence case', () => {
    expect(humanise('digital_operator')).toBe('Digital operator');
    expect(humanise('preferred_core')).toBe('Preferred core');
    expect(humanise('quote_drafted')).toBe('Quote drafted');
    expect(humanise('shoot_live')).toBe('Shoot live');
  });

  it('kebab-case → sentence case', () => {
    expect(humanise('hold-requested')).toBe('Hold requested');
  });

  it('preserves acronyms via SPECIAL_CASES', () => {
    expect(humanise('asf')).toBe('ASF');
    expect(humanise('gst')).toBe('GST');
    expect(humanise('abn')).toBe('ABN');
    expect(humanise('wwcc')).toBe('WWCC');
  });

  it('hyphenates compound terms correctly', () => {
    expect(humanise('client_in_house')).toBe('Client in-house');
    expect(humanise('post_production')).toBe('Post-production');
    expect(humanise('pre_production')).toBe('Pre-production');
    expect(humanise('morning_after_check')).toBe('Morning-after check');
  });

  it('is case-insensitive on input', () => {
    expect(humanise('CLIENT_IN_HOUSE')).toBe('Client in-house');
    expect(humanise('Quote_Drafted')).toBe('Quote drafted');
  });

  it('upcases acronym tokens within multi-word values', () => {
    expect(humanise('pr_digital')).toBe('PR digital');
    expect(humanise('all_pos')).toBe('All POS');
    expect(humanise('out_of_home_pr')).toBe('Out of home PR');
  });

  it('humaniseList joins with default separator', () => {
    expect(humaniseList(['digital_operator', 'assistant'])).toBe('Digital operator, Assistant');
  });

  it('humaniseList handles empty / null', () => {
    expect(humaniseList(null)).toBe('');
    expect(humaniseList([])).toBe('');
  });
});
