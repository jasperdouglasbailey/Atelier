/**
 * Lethal trifecta tests.
 *
 * The trifecta is a NON-NEGOTIABLE doctrinal rule. These tests lock the
 * truth table: refuse iff all three components are present.
 */

import { describe, it, expect } from 'vitest';
import {
  checkTrifecta,
  assertNotTrifecta,
  LethalTrifectaError,
  LETHAL_TRIFECTA_REFUSAL_CLAUSE,
} from './lethal-trifecta';

describe('checkTrifecta', () => {
  it('allows zero of three', () => {
    expect(checkTrifecta({
      readsSensitive: false,
      usesUntrustedInput: false,
      performsExternalComms: false,
    }).allowed).toBe(true);
  });

  it('allows one of three (each combination)', () => {
    expect(checkTrifecta({ readsSensitive: true, usesUntrustedInput: false, performsExternalComms: false }).allowed).toBe(true);
    expect(checkTrifecta({ readsSensitive: false, usesUntrustedInput: true, performsExternalComms: false }).allowed).toBe(true);
    expect(checkTrifecta({ readsSensitive: false, usesUntrustedInput: false, performsExternalComms: true }).allowed).toBe(true);
  });

  it('allows two of three (each combination)', () => {
    expect(checkTrifecta({ readsSensitive: true, usesUntrustedInput: true, performsExternalComms: false }).allowed).toBe(true);
    expect(checkTrifecta({ readsSensitive: true, usesUntrustedInput: false, performsExternalComms: true }).allowed).toBe(true);
    expect(checkTrifecta({ readsSensitive: false, usesUntrustedInput: true, performsExternalComms: true }).allowed).toBe(true);
  });

  it('refuses three of three', () => {
    const r = checkTrifecta({
      readsSensitive: true,
      usesUntrustedInput: true,
      performsExternalComms: true,
    });
    expect(r.allowed).toBe(false);
    expect(r.triggered).toHaveLength(3);
    expect(r.reason).toContain('lethal trifecta');
  });

  it('refusal reason names all three components', () => {
    const r = checkTrifecta({
      readsSensitive: true,
      usesUntrustedInput: true,
      performsExternalComms: true,
    });
    expect(r.reason).toContain('sensitive');
    expect(r.reason).toContain('untrusted');
    expect(r.reason).toContain('external');
  });
});

describe('assertNotTrifecta', () => {
  it('does not throw when allowed', () => {
    expect(() => assertNotTrifecta({
      readsSensitive: true,
      usesUntrustedInput: true,
      performsExternalComms: false,
    })).not.toThrow();
  });

  it('throws LethalTrifectaError when all three are present', () => {
    expect(() => assertNotTrifecta({
      readsSensitive: true,
      usesUntrustedInput: true,
      performsExternalComms: true,
    })).toThrow(LethalTrifectaError);
  });

  it('thrown error lists all three components', () => {
    try {
      assertNotTrifecta({
        readsSensitive: true,
        usesUntrustedInput: true,
        performsExternalComms: true,
      });
      throw new Error('expected throw');
    } catch (err) {
      expect(err).toBeInstanceOf(LethalTrifectaError);
      const e = err as LethalTrifectaError;
      expect(e.triggered).toEqual(
        expect.arrayContaining(['sensitive_data', 'untrusted_input', 'external_comms']),
      );
    }
  });
});

describe('LETHAL_TRIFECTA_REFUSAL_CLAUSE', () => {
  it('is non-empty and tells the agent to refuse, not hedge', () => {
    expect(LETHAL_TRIFECTA_REFUSAL_CLAUSE).toMatch(/refuse/i);
    expect(LETHAL_TRIFECTA_REFUSAL_CLAUSE).not.toMatch(/may also/i);
  });
});
