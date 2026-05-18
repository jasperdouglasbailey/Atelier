import { describe, it, expect } from 'vitest';
import { matchTalentInBrief } from './talent-match';
import type { Talent } from '@/lib/types/database';

// Minimal Talent shape — the matcher only uses these four fields.
type T = Pick<Talent, 'id' | 'working_name' | 'legal_name' | 'nicknames'>;

const OLIVER: T = {
  id: 'tal-oliver',
  working_name: 'Oliver Begg',
  legal_name: 'Oliver James Begg',
  nicknames: ['Oly', 'Olls'],
};

const MICHAEL: T = {
  id: 'tal-michael',
  working_name: 'Michael Comninus',
  legal_name: 'Michael Comninus',
  nicknames: ['Mike'],
};

const ROSTER: T[] = [OLIVER, MICHAEL];

describe('matchTalentInBrief', () => {
  it('returns null when roster is empty', () => {
    expect(matchTalentInBrief('Oliver please', null, [])).toBeNull();
  });

  it('matches full working name as the strongest signal', () => {
    const m = matchTalentInBrief(
      'Can we get Oliver Begg on the 22nd of May?',
      null,
      ROSTER,
    );
    expect(m?.talent_id).toBe('tal-oliver');
    expect(m?.matched_via).toBe('working_name');
    expect(m?.confidence).toBe(1.0);
  });

  it('matches first-word working name when full phrase missing', () => {
    const m = matchTalentInBrief(
      'Wondering if Oliver is around for the Testino campaign',
      null,
      ROSTER,
    );
    expect(m?.talent_id).toBe('tal-oliver');
    expect(m?.matched_via).toBe('working_name');
    expect(m?.confidence).toBeCloseTo(0.8);
  });

  it('matches a nickname when no working-name hit', () => {
    const m = matchTalentInBrief(
      'Grading by Oly please',
      null,
      ROSTER,
    );
    expect(m?.talent_id).toBe('tal-oliver');
    expect(m?.matched_via).toBe('nickname');
  });

  it('legal name match scores between working-full and nickname', () => {
    const m = matchTalentInBrief(
      'Per the contract with Oliver James Begg…',
      null,
      ROSTER,
    );
    expect(m?.talent_id).toBe('tal-oliver');
    expect(m?.matched_via).toBe('legal_name');
    expect(m?.confidence).toBe(0.95);
  });

  it('uses LLM talent_spec hint when text lacks the name', () => {
    const m = matchTalentInBrief(
      'Easy day, 2 stills, in Brookvale.',
      'Oliver Begg',
      ROSTER,
    );
    expect(m?.talent_id).toBe('tal-oliver');
  });

  it('does NOT match substring inside an unrelated word', () => {
    // "Mike" should not match inside "Bike". Word-boundary check.
    const m = matchTalentInBrief('Bike storage available on set', null, ROSTER);
    expect(m).toBeNull();
  });

  it('picks the higher-scoring talent when two are mentioned', () => {
    // Oliver gets the full phrase (1.0); Michael only the head word (0.8).
    const m = matchTalentInBrief(
      'Oliver Begg shooting, Michael is the post lead',
      null,
      ROSTER,
    );
    expect(m?.talent_id).toBe('tal-oliver');
  });

  it('returns null when only ambiguous short tokens would match', () => {
    // Hypothetical talent with a 2-letter nickname ("Bo") shouldn't match — too short.
    const shortRoster: T[] = [{
      id: 'tal-x', working_name: 'Bo', legal_name: 'Bo', nicknames: [],
    }];
    // "Bo" is below the 3-char min-token threshold so no match.
    expect(matchTalentInBrief('Bo is around', null, shortRoster)).toBeNull();
  });

  it('apostrophes and punctuation in names don\'t block the match', () => {
    const apostrophe: T[] = [{
      id: 'tal-y', working_name: "D'Angelo Russell", legal_name: "D'Angelo Russell", nicknames: [],
    }];
    const m = matchTalentInBrief('Confirmed DAngelo Russell for the shoot', null, apostrophe);
    expect(m?.talent_id).toBe('tal-y');
  });
});
