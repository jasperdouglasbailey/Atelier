/**
 * Talent matching — find which agency-represented artist a brief is for.
 *
 * Briefs almost always name the artist directly: "Can we get Oliver
 * for…", "shoot the new Testino campaign with Oly", etc. This module
 * matches those mentions against the active talent roster + the
 * `nicknames` array (PR#154) so the operator can apply the talent to
 * the booking team with a single checkbox.
 *
 * The function is pure and deterministic — no fuzzy edit-distance,
 * no Levenshtein. We use exact word-boundary matches against three
 * name sources per talent (working_name, legal_name, each nickname),
 * then return the best-scored candidate.
 *
 * Why no fuzzy matching: false positives are worse than misses. If the
 * brief says "Olly" and we don't have that nickname stored, we'd rather
 * surface no match than match the wrong person. The operator can fix a
 * miss with one click via the existing manual picker; fixing a wrong
 * auto-match is invisible until the wrong person turns up on shoot day.
 */

import type { Talent } from '@/lib/types/database';

export type TalentMatch = {
  talent_id: string;
  working_name: string;
  matched_via: 'working_name' | 'legal_name' | 'nickname';
  matched_token: string;
  /** 0–1 score; higher is more confident. */
  confidence: number;
  /**
   * The talent's assigned agent (user_id) when present. Used by the
   * brief-apply flow to default booking ownership to this agent so a
   * brief mentioning "Oliver" routes itself to Gary (Oliver's agent)
   * without manual triage. Null when the talent is unassigned.
   * Migration 0069 / Phase 1 multi-agent rollout.
   */
  assigned_agent_user_id: string | null;
};

/**
 * Tokenise a name source into the form we'll match against. We:
 *   - lowercase
 *   - strip punctuation (apostrophes, hyphens, periods)
 *   - drop tokens shorter than 3 chars (avoids matching "li", "an" etc.
 *     in unrelated brief text)
 *   - keep multi-word names whole (so "Oliver Begg" matches as a phrase)
 *
 * Returns the cleaned phrase plus its head-word for shorter matches.
 * Empty array if the source is too short to safely match.
 */
function buildMatchTokens(source: string): string[] {
  const cleaned = source
    .toLowerCase()
    .replace(/['’`.\-_]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
  if (cleaned.length < 3) return [];
  const tokens = [cleaned];
  const head = cleaned.split(' ')[0];
  if (head !== cleaned && head.length >= 3) tokens.push(head);
  return tokens;
}

/**
 * Test whether a token appears in the text as a whole word. The text is
 * already lowercased; the token must be surrounded by non-letter
 * characters (start/end of string counts).
 *
 * Avoids substring false positives like "Cat" matching "catering".
 */
function tokenAppearsAsWord(text: string, token: string): boolean {
  const idx = text.indexOf(token);
  if (idx === -1) return false;
  const before = idx === 0 ? '' : text[idx - 1];
  const after = idx + token.length >= text.length ? '' : text[idx + token.length];
  // Block when bordered by letters/digits. Word/space/punctuation borders are fine.
  const isLetter = (c: string) => /[a-z0-9]/.test(c);
  return !isLetter(before) && !isLetter(after);
}

/**
 * Returns the best-matched talent for a brief, or null if no confident
 * match. `talentSpec` is the LLM-extracted "we want Oliver" hint when
 * available; falls back to scanning the full raw text.
 *
 * Scoring (max wins, ties broken by the source priority below):
 *   - 1.00  working_name (full) appears in text
 *   - 0.95  legal_name (full) appears in text
 *   - 0.90  nickname (full) appears in text
 *   - 0.80  working_name head-token (first word) appears
 *   - 0.75  legal_name head-token appears
 *
 * Threshold to return a match: 0.75. Multi-word phrase hits always beat
 * single-word head hits because the phrase is rarer.
 */
export function matchTalentInBrief(
  rawText: string,
  talentSpec: string | null | undefined,
  talents: Pick<Talent, 'id' | 'working_name' | 'legal_name' | 'nicknames' | 'assigned_agent_user_id'>[],
): TalentMatch | null {
  if (talents.length === 0) return null;

  // Build a combined haystack: raw brief + talent_spec hint (LLM output).
  // The talent_spec value is duplicated so a hit there contributes the same
  // weight; it's not a separate priority tier. Lowercase + strip punctuation
  // so the haystack uses the same alphabet as the tokens.
  const haystack = [(rawText ?? ''), (talentSpec ?? '')]
    .join(' ')
    .toLowerCase()
    .replace(/['’`.\-_]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
  if (haystack.length === 0) return null;

  let best: TalentMatch | null = null;
  for (const t of talents) {
    const candidates: Array<{ source: 'working_name' | 'legal_name' | 'nickname'; tokens: string[] }> = [
      { source: 'working_name', tokens: buildMatchTokens(t.working_name) },
      { source: 'legal_name',   tokens: t.legal_name ? buildMatchTokens(t.legal_name) : [] },
      ...((t.nicknames ?? []).map((n) => ({ source: 'nickname' as const, tokens: buildMatchTokens(n) }))),
    ];

    for (const cand of candidates) {
      // tokens[0] is the full phrase; tokens[1] (when present) is the head word.
      for (let i = 0; i < cand.tokens.length; i++) {
        const token = cand.tokens[i];
        if (!tokenAppearsAsWord(haystack, token)) continue;

        const isFullPhrase = i === 0;
        let score: number;
        if (cand.source === 'working_name') score = isFullPhrase ? 1.0 : 0.8;
        else if (cand.source === 'legal_name') score = isFullPhrase ? 0.95 : 0.75;
        else score = 0.9; // nickname full only (we don't head-token nicknames)

        if (!best || score > best.confidence) {
          best = {
            talent_id: t.id,
            working_name: t.working_name,
            matched_via: cand.source,
            matched_token: token,
            confidence: score,
            assigned_agent_user_id: t.assigned_agent_user_id ?? null,
          };
        }
      }
    }
  }

  if (!best || best.confidence < 0.75) return null;
  return best;
}
