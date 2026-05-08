/**
 * Name & contact normalisation utilities.
 *
 * Used by manual entry forms and CSV import so we never end up with
 * "MASON MACKENZIE WOOD" in the database — names are always title-cased
 * before insert.
 */

/**
 * Convert a name to title case while RESPECTING the user's intentional
 * casing decisions. Used for both manual entries and CSV imports.
 *
 * Rules per token (whitespace-separated):
 *   - All-caps abbreviations of length ≤4 stay uppercase: "WPP", "AJE",
 *     "BBC", "NYC", "JP" — these are almost always brand/agency
 *     acronyms the user wants preserved.
 *   - Mixed-case tokens are left ALONE: "iPhone", "MacBook", "PaCkAgE".
 *     If it has any lowercase letter AND any uppercase letter, the user
 *     typed it that way deliberately.
 *   - All-lowercase or all-uppercase tokens of length ≥5 get title-cased
 *     (catches both "PRODUCTION" and "production" → "Production").
 *   - Hyphens preserved: "seok-ho yoon" → "Seok-Ho Yoon"
 *   - Apostrophes preserved: "o'brien" → "O'Brien"
 *
 * Pure function — safe to import from anywhere.
 */
export function titleCaseName(input: string): string {
  if (!input) return input;
  const trimmed = input.trim();
  if (!trimmed) return trimmed;

  // Title-case a single word, handling hyphens and apostrophes inside it.
  function casePart(word: string): string {
    if (!word) return word;
    return word
      .split('-')
      .map((seg) =>
        seg
          .split("'")
          .map((s) => (s.length === 0 ? s : s.charAt(0).toUpperCase() + s.slice(1).toLowerCase()))
          .join("'"),
      )
      .join('-');
  }

  // Step 1: detect whether the WHOLE input is single-case ("messy bulk
  // data") vs intentionally mixed ("user typed it carefully"). If the
  // input has both upper and lower letters somewhere across all tokens
  // combined, we trust the user's intent and only normalise the
  // lowercase parts. If it's uniformly upper or lower (e.g. CSV import
  // of "JOHN O'CONNOR" or someone typing "wpp production" in a hurry),
  // we apply naive title-casing to everything.
  const allLetters = trimmed.replace(/[^A-Za-z]/g, '');
  const inputHasUpper = /[A-Z]/.test(allLetters);
  const inputHasLower = /[a-z]/.test(allLetters);
  const inputIsMixed = inputHasUpper && inputHasLower;

  return trimmed
    .split(/(\s+)/)
    .map((tok) => {
      if (/^\s+$/.test(tok)) return tok;

      const letters = tok.replace(/[^A-Za-z]/g, '');
      if (!letters) return tok;

      if (inputIsMixed) {
        // Input is intentionally mixed. Trust it for tokens that aren't
        // pure lowercase. Only naive-case the all-lowercase tokens.
        const tokAllLower = letters === letters.toLowerCase();
        if (!tokAllLower) return tok;            // preserve "WPP", "iPhone", "Begg"
        return casePart(tok);                     // capitalise "the", "production"
      }

      // Input is all-upper or all-lower (bulk / sloppy entry) — title-case
      // everything, but still preserve all-caps initials of length ≤2
      // (very common in names: "JP", "DJ").
      if (/^[A-Z]{2}$/.test(tok)) return tok;
      return casePart(tok.toLowerCase());
    })
    .join('');
}

/**
 * Normalise an email — trim, lowercase, strip whitespace.
 */
export function normaliseEmail(input: string | null | undefined): string | null {
  if (!input) return null;
  const cleaned = input.trim().toLowerCase();
  return cleaned || null;
}

/**
 * Normalise a phone for duplicate matching: strip everything but digits.
 * Original formatting is preserved in storage; this is only for comparison.
 *
 * "0435 799 397" → "0435799397"
 * "+61 435 799 397" → "61435799397"
 */
export function normalisePhoneForMatch(input: string | null | undefined): string {
  if (!input) return '';
  return input.replace(/\D/g, '');
}

/**
 * Parse "Dietary: X | Drink: Y" style notes into structured fields.
 * Returns whatever it can extract; missing fields stay null.
 *
 * Handles common variants:
 *   - "Dietary: NIL | Drink: Long black"
 *   - "Dietary: NIL"          (no drink)
 *   - "Drink: Long black"     (no dietary)
 *   - "Dietary: NIL DIET (healthy option pls) | Drink: LB"
 */
export function parseDietaryDrinkFromNotes(notes: string | null | undefined): {
  dietary: string | null;
  drink_order: string | null;
  /** Whatever was left in the notes after extracting the structured fields. */
  remainder: string | null;
} {
  if (!notes) return { dietary: null, drink_order: null, remainder: null };

  const dietaryMatch = notes.match(/Dietary:\s*([^|\r\n]*)/i);
  const drinkMatch = notes.match(/Drink:\s*([^|\r\n]*)/i);

  const dietary = dietaryMatch?.[1]?.trim() || null;
  const drink_order = drinkMatch?.[1]?.trim() || null;

  // Compute remainder: strip the Dietary: ... | Drink: ... segments
  let remainder: string | null = notes
    .replace(/Dietary:\s*[^|\r\n]*\s*\|?\s*/gi, '')
    .replace(/Drink:\s*[^|\r\n]*\s*\|?\s*/gi, '')
    .replace(/\|\s*$/gm, '')
    .trim();
  if (!remainder) remainder = null;

  return { dietary, drink_order, remainder };
}
