/**
 * Brief-intake fixture regression tests.
 *
 * Asserts the HEURISTIC parser hits its minimum coverage on five
 * representative briefs (3 progressively-degraded variants of the same
 * underlying brief + 2 different producer/client styles).
 *
 * What this catches:
 *   - Regex regressions in `parseBrief()`
 *   - Tokenisation changes that lose dates / durations / territories
 *   - Changes to the canonical ParsedBrief shape that orphan fixture fields
 *
 * What this does NOT catch (out of scope — would require live API):
 *   - LLM-side extraction quality. Documented in `expected.ts` under
 *     `idealLlm` for each fixture as a future structured-test target.
 *
 * Add a new fixture: drop a .txt file in ./brief-intake.fixtures/, add
 * an entry to FIXTURES in expected.ts, and the loop below picks it up.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { parseBrief } from '@/lib/utils/brief-parser';
import { FIXTURES } from './brief-intake.fixtures/expected';

const FIXTURE_DIR = join(__dirname, 'brief-intake.fixtures');

function loadFixture(name: string): string {
  return readFileSync(join(FIXTURE_DIR, `${name}.txt`), 'utf-8');
}

describe('brief-intake fixtures — heuristic coverage', () => {
  for (const [name, expectation] of Object.entries(FIXTURES)) {
    describe(name, () => {
      const text = loadFixture(name);
      const result = parseBrief(text);

      // Assert each expected heuristic field is present + matches
      for (const [field, expectedValue] of Object.entries(expectation.heuristic)) {
        if (expectedValue === null) {
          // Documented "not extracted by heuristic" — assert it IS null so
          // we notice when a future heuristic improvement starts catching it
          // (at which point upgrade the expected value).
          it(`heuristic: ${field} is null (heuristic limitation)`, () => {
            expect(result[field as keyof typeof result]).toBeNull();
          });
        } else {
          it(`heuristic: ${field} → ${JSON.stringify(expectedValue)}`, () => {
            expect(result[field as keyof typeof result]).toEqual(expectedValue);
          });
        }
      }
    });
  }
});

describe('brief-intake fixtures — extracted-fields baseline', () => {
  // Smoke test: count how many fields each fixture's heuristic pulls out.
  // Useful as a top-line "is the parser getting better or worse" signal.
  // Records baseline numbers — bump when the heuristic genuinely improves.
  const BASELINES: Record<string, { min: number }> = {
    'venroy-golden': { min: 6 },       // dates + location + duration + territory + count + type
    'venroy-compressed': { min: 5 },   // dates + duration + count + type (no location/territory)
    'venroy-loose': { min: 5 },        // dates + duration + count + type
    'inaura-brooke': { min: 3 },        // duration + type + talent_count
    'coronation-caleb': { min: 4 },    // dates + duration + count + type
  };

  for (const [name, baseline] of Object.entries(BASELINES)) {
    it(`${name}: extracts at least ${baseline.min} non-null fields`, () => {
      const text = loadFixture(name);
      const result = parseBrief(text);
      const count = Object.values(result).filter((v) => v !== null).length;
      expect(count, `Fixture "${name}" regressed: extracted ${count} fields, baseline is ${baseline.min}`).toBeGreaterThanOrEqual(baseline.min);
    });
  }
});
