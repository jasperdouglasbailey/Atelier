/**
 * Convert a snake_case enum value into a human-readable string.
 *
 *   humanise('client_in_house')        // "Client in-house"
 *   humanise('post_production')        // "Post-production"
 *   humanise('digital_operator')       // "Digital operator"
 *   humanise('hair_and_makeup')        // "Hair and makeup"
 *   humanise(null)                     // ""
 *
 * Behaviour rules:
 *   - underscores → spaces
 *   - first letter capitalised, rest lower-cased (sentence case)
 *   - if a controlled-vocabulary label exists in `LABEL_MAPS`, prefer it
 *     (those are hand-tuned for terms like "ASF", "GST", "PR / Press"
 *     where mechanical rules are wrong)
 *
 * Used as a fallback. Specific enum maps in `constants.ts` (e.g.
 * `BOOKING_STATE_LABELS`) take precedence — call `humanise()` only when
 * a value is free-form or no map exists.
 */

const SPECIAL_CASES: Record<string, string> = {
  // Hyphenated compounds (the mechanical "first letter only" rule misses these)
  client_in_house:    'Client in-house',
  agency_in_house:    'Agency in-house',
  pr_press:           'PR / Press',
  hair_and_makeup:    'Hair and makeup',
  pre_production:     'Pre-production',
  post_production:    'Post-production',
  pre_production_only:'Pre-production only',
  morning_after_check:'Morning-after check',
  fashion_film:       'Fashion film',
  still_life:         'Still life',
  lookbook_ecomm:     'Lookbook / eComm',
  arty_commission:    'Arty commission',
  hold_requested:     'Hold requested',
};

/** Acronyms that should remain capitalised wherever they appear as a token. */
const ACRONYMS = new Set([
  'asf', 'gst', 'abn', 'usi', 'bas', 'hmu', 'hmua', 'bur', 'aud', 'rcti',
  'sla', 'ato', 'app', 'wwcc', 'ot', 'qa', 'ai', 'pr', 'pos', 'oauth',
]);

const ACRONYM_OVERRIDES: Record<string, string> = {
  oauth: 'OAuth',
};

/**
 * Convert a snake_case / kebab-case string to a human-readable label.
 * Returns '' if input is null / undefined / empty so it's safe to drop
 * straight into JSX.
 */
export function humanise(value: string | null | undefined): string {
  if (!value) return '';
  const normalised = value.trim().toLowerCase();
  if (!normalised) return '';

  // 1. Whole-string special cases (compound terms with hyphens etc.)
  if (SPECIAL_CASES[normalised]) return SPECIAL_CASES[normalised];

  // 2. Single-token acronyms ("asf" → "ASF")
  if (ACRONYMS.has(normalised)) {
    return ACRONYM_OVERRIDES[normalised] ?? normalised.toUpperCase();
  }

  // 3. Multi-token: split, sentence-case first word, then upcase any
  //    individual word that's a known acronym.
  const tokens = normalised.replace(/[-_]+/g, ' ').trim().split(/\s+/);
  return tokens
    .map((tok, i) => {
      if (ACRONYMS.has(tok)) return ACRONYM_OVERRIDES[tok] ?? tok.toUpperCase();
      if (i === 0) return tok.charAt(0).toUpperCase() + tok.slice(1);
      return tok;
    })
    .join(' ');
}

/**
 * Humanise an array of enum values, joined by a separator. Useful for
 * media/territory chips, secondary roles, certifications, etc.
 */
export function humaniseList(
  values: readonly string[] | null | undefined,
  separator = ', ',
): string {
  if (!values || values.length === 0) return '';
  return values.map(humanise).filter(Boolean).join(separator);
}
