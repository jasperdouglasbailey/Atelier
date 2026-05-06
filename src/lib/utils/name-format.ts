/**
 * Name & contact normalisation utilities.
 *
 * Used by manual entry forms and CSV import so we never end up with
 * "MASON MACKENZIE WOOD" in the database — names are always title-cased
 * before insert.
 */

/**
 * Convert a name to title case, preserving:
 *   - Hyphens: "seok-ho yoon" → "Seok-Ho Yoon"
 *   - Apostrophes: "o'brien" → "O'Brien"
 *   - All-caps initials of length ≤2 stay uppercase: "JP Westlake" → "JP Westlake"
 *
 * Pure function — safe to import from anywhere.
 */
export function titleCaseName(input: string): string {
  if (!input) return input;
  const trimmed = input.trim();
  if (!trimmed) return trimmed;

  // Title-case a single word, handling hyphens and apostrophes inside it.
  // "seok-ho" → "Seok-Ho", "o'brien" → "O'Brien", "burian-hodge" → "Burian-Hodge"
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

  // Split on whitespace only (hyphens stay inside the token)
  return trimmed
    .split(/(\s+)/)
    .map((tok) => {
      if (/^\s+$/.test(tok)) return tok;
      // Preserve all-caps initials of length ≤2 that have no hyphens or apostrophes:
      //   "JP" → "JP"   (initials kept)
      //   "DJ" → "DJ"
      //   "HO" alone → would also stay, but only if it was the original whole word.
      // We can't distinguish here, so trust: 2-char standalone all-caps tokens stay uppercase.
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
