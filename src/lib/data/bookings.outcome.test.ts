/**
 * Tests for deriveOutcome — the function that maps a booking's terminal
 * state to a corpus outcome value when we hard-delete a booking.
 *
 * The classification rules matter for downstream win-rate analytics, so
 * we lock them here.
 */

import { describe, it, expect } from 'vitest';
import { deriveOutcome } from './bookings';

describe('deriveOutcome', () => {
  describe('won outcomes', () => {
    it('classifies paid bookings as won (regardless of quote-sent flag)', () => {
      expect(deriveOutcome('paid', true)).toBe('won');
      expect(deriveOutcome('paid', false)).toBe('won');
    });

    it('classifies released bookings as won', () => {
      // "released" in this codebase means delivered/completed — counts as won
      // for corpus purposes (revenue was earned).
      expect(deriveOutcome('released', true)).toBe('won');
    });
  });

  describe('lost outcomes', () => {
    it('classifies cancelled-before-quote-sent as lost_pre_quote', () => {
      expect(deriveOutcome('cancelled', false)).toBe('lost_pre_quote');
    });

    it('classifies cancelled-after-quote-sent as lost_post_quote', () => {
      // The interesting bucket — client saw the number and walked.
      expect(deriveOutcome('cancelled', true)).toBe('lost_post_quote');
    });
  });

  describe('non-terminal states', () => {
    it('returns "cancelled" as a fallback for unexpected non-terminal states', () => {
      // The hard-delete path guards against non-terminal states reaching
      // here, but the function itself is defensive — never throws.
      expect(deriveOutcome('brief_received', false)).toBe('cancelled');
      expect(deriveOutcome('quote_sent', true)).toBe('cancelled');
    });
  });
});
