/**
 * Tests for deriveOutcome — maps a booking's state to a corpus outcome
 * value when we hard-delete a booking. Used for both terminal-state
 * deletes (paid / cancelled / etc.) and mid-stage deletes (drafts, quotes
 * killed before completion) since PR shipping 2026-05-20.
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

  describe('terminal lost outcomes', () => {
    it('classifies cancelled-before-quote-sent as lost_pre_quote', () => {
      expect(deriveOutcome('cancelled', false)).toBe('lost_pre_quote');
    });

    it('classifies cancelled-after-quote-sent as lost_post_quote', () => {
      // The interesting bucket — client saw the number and walked.
      expect(deriveOutcome('cancelled', true)).toBe('lost_post_quote');
    });

    it('classifies written-off bookings by quote-sent flag too', () => {
      expect(deriveOutcome('written_off', false)).toBe('lost_pre_quote');
      expect(deriveOutcome('written_off', true)).toBe('lost_post_quote');
    });
  });

  describe('mid-stage deletes (PR 2026-05-20: any state deletable)', () => {
    // The hard-delete path no longer guards on terminal states. A draft
    // killed before the quote was sent should be lost_pre_quote; a
    // quote_sent booking deleted after the client saw the number should
    // be lost_post_quote. The quote-sent flag is the right axis.
    it('draft (brief_received) deleted before quote sent → lost_pre_quote', () => {
      expect(deriveOutcome('brief_received', false)).toBe('lost_pre_quote');
    });

    it('quote_drafted (operator killed it before sending) → lost_pre_quote', () => {
      expect(deriveOutcome('quote_drafted', false)).toBe('lost_pre_quote');
    });

    it('quote_sent → lost_post_quote (client had the number)', () => {
      expect(deriveOutcome('quote_sent', true)).toBe('lost_post_quote');
    });

    it('shoot_live mid-shoot kill → lost_post_quote', () => {
      // Extreme edge case but the math should still hold: the client
      // saw the number at some point so it's post-quote.
      expect(deriveOutcome('shoot_live', true)).toBe('lost_post_quote');
    });
  });
});
