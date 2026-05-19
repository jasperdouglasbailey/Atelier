import { describe, it, expect } from 'vitest';
import { matchTalentInBrief, matchTalentsInBrief } from './talent-match';
import type { Talent } from '@/lib/types/database';

// Minimal Talent shape — the matcher only uses these fields.
type T = Pick<Talent, 'id' | 'working_name' | 'legal_name' | 'nicknames' | 'assigned_agent_user_id'>;

const OLIVER: T = {
  id: 'tal-oliver',
  working_name: 'Oliver Begg',
  legal_name: 'Oliver James Begg',
  nicknames: ['Oly', 'Olls'],
  assigned_agent_user_id: 'agent-gary',  // Phase 1: brief mentioning Oliver routes to Gary
};

const MICHAEL: T = {
  id: 'tal-michael',
  working_name: 'Michael Comninus',
  legal_name: 'Michael Comninus',
  nicknames: ['Mike'],
  assigned_agent_user_id: null,
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
      assigned_agent_user_id: null,
    }];
    // "Bo" is below the 3-char min-token threshold so no match.
    expect(matchTalentInBrief('Bo is around', null, shortRoster)).toBeNull();
  });

  it('carries through the matched talent\'s assigned agent for routing', () => {
    // Phase 1 multi-agent: brief mentioning Oliver should propose Gary
    // (Oliver's agent) as the booking owner. The matcher just returns
    // the assigned_agent_user_id; the applying action does the routing.
    const m = matchTalentInBrief('Oliver Begg for the campaign', null, ROSTER);
    expect(m?.talent_id).toBe('tal-oliver');
    expect(m?.assigned_agent_user_id).toBe('agent-gary');
  });

  it('returns null assigned_agent when the matched talent is unassigned', () => {
    const m = matchTalentInBrief('Mike on this one', null, ROSTER);
    expect(m?.talent_id).toBe('tal-michael');
    expect(m?.assigned_agent_user_id).toBeNull();
  });

  it('apostrophes and punctuation in names don\'t block the match', () => {
    const apostrophe: T[] = [{
      id: 'tal-y', working_name: "D'Angelo Russell", legal_name: "D'Angelo Russell", nicknames: [],
      assigned_agent_user_id: null,
    }];
    const m = matchTalentInBrief('Confirmed DAngelo Russell for the shoot', null, apostrophe);
    expect(m?.talent_id).toBe('tal-y');
  });
});

describe('matchTalentsInBrief (multi-match)', () => {
  it('returns an empty array when no talents match', () => {
    expect(matchTalentsInBrief('No artists referenced here', null, ROSTER)).toEqual([]);
  });

  it('returns a single-element array when one talent matches', () => {
    const m = matchTalentsInBrief('Oliver Begg for the campaign', null, ROSTER);
    expect(m).toHaveLength(1);
    expect(m[0].talent_id).toBe('tal-oliver');
  });

  it('returns BOTH talents when the brief names two', () => {
    // Oliver gets a full working-name hit; Michael gets a nickname hit.
    const m = matchTalentsInBrief(
      'We want Oliver Begg shooting and Mike doing post',
      null,
      ROSTER,
    );
    expect(m.map((x) => x.talent_id).sort()).toEqual(['tal-michael', 'tal-oliver']);
  });

  it('orders by descending confidence — full working-name beats nickname', () => {
    const m = matchTalentsInBrief(
      'Bringing Oliver Begg and Mike on the job',
      null,
      ROSTER,
    );
    // Oliver (1.0) before Michael (0.9) — full phrase beats nickname.
    expect(m[0].talent_id).toBe('tal-oliver');
    expect(m[1].talent_id).toBe('tal-michael');
    expect(m[0].confidence).toBeGreaterThan(m[1].confidence);
  });

  it('still respects the 0.75 threshold per talent', () => {
    const shortRoster: T[] = [{
      id: 'tal-x', working_name: 'Bo', legal_name: 'Bo', nicknames: [],
      assigned_agent_user_id: null,
    }];
    // "Bo" is below the 3-char min-token threshold — no match for that talent.
    expect(matchTalentsInBrief('Bo is around', null, shortRoster)).toEqual([]);
  });

  it('aggregates per-talent best — multiple hits for one talent collapse to one match', () => {
    // Mentions Oliver twice (full name + nickname). Should still return one entry.
    const m = matchTalentsInBrief('Oliver Begg confirmed, talked to Oly', null, ROSTER);
    expect(m).toHaveLength(1);
    expect(m[0].talent_id).toBe('tal-oliver');
    expect(m[0].confidence).toBe(1.0); // takes the better of the two hits
  });
});
