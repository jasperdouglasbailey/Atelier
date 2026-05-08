/**
 * City ordering for crew + talent lists.
 *
 * The four "anchor" cities sit at the top in fixed order — these are the
 * cities Saunders & Co books from most often, so producers expect them
 * to appear first regardless of population. After the anchors, remaining
 * cities are sorted by frequency (most-booked first), then alphabetically
 * to break ties. "No city set" always sinks to the bottom.
 *
 * Sydney is anchored first as the primary base; Melbourne second; Byron
 * Bay / Gold Coast as a single anchor (some crew list it as one slash-
 * separated string, others as either alone — match either form); Adelaide
 * fourth. After those, frequency wins.
 */

export const NO_CITY_KEY = '__no_city__';

export const ANCHOR_CITIES = [
  'Sydney',
  'Melbourne',
  // Byron Bay / Gold Coast — match either form. The display label uses
  // whichever form appears first in the data.
  ['Byron Bay', 'Gold Coast', 'Byron Bay/Gold Coast', 'Byron'],
  'Adelaide',
] as const;

/**
 * Returns the anchor index (0-3) for a city, or -1 if not anchored.
 * Case-insensitive, accepts substring matches for the multi-form anchors.
 */
function anchorIndex(city: string): number {
  const lower = city.toLowerCase();
  for (let i = 0; i < ANCHOR_CITIES.length; i++) {
    const anchor = ANCHOR_CITIES[i];
    if (typeof anchor === 'string') {
      if (lower === anchor.toLowerCase()) return i;
    } else {
      if (anchor.some((variant) => lower.includes(variant.toLowerCase()))) return i;
    }
  }
  return -1;
}

export interface CityCount {
  key: string;
  count: number;
}

/**
 * Order a list of city keys per the agreed rule:
 *   1. Anchor cities (Sydney → Melbourne → Byron/Gold Coast → Adelaide)
 *   2. Remaining cities by frequency desc, then alphabetical
 *   3. NO_CITY_KEY last
 */
export function orderCityKeys(counts: CityCount[]): string[] {
  return [...counts]
    .sort((a, b) => {
      if (a.key === NO_CITY_KEY) return 1;
      if (b.key === NO_CITY_KEY) return -1;
      const aAnchor = anchorIndex(a.key);
      const bAnchor = anchorIndex(b.key);
      if (aAnchor !== -1 && bAnchor !== -1) return aAnchor - bAnchor;
      if (aAnchor !== -1) return -1;
      if (bAnchor !== -1) return 1;
      // Both non-anchor: frequency desc, alphabetical asc
      if (a.count !== b.count) return b.count - a.count;
      return a.key.localeCompare(b.key);
    })
    .map((c) => c.key);
}
