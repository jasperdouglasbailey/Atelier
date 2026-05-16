/**
 * Heuristic brief parser — extracts structured fields from raw brief/email text.
 * No LLM required; uses regex patterns common to Sydney commercial photography briefs.
 *
 * Returns a Partial<ParsedBrief> — only fields confidently extracted are set.
 * The caller should present these as suggestions, not auto-apply them.
 *
 * Key design rules:
 *  - "Live Date", "Go Live", "Launch Date" etc. are NEVER extracted as shoot dates.
 *    They describe when the campaign goes public, not when the photography happens.
 *  - Dates without a strong contextual signal (shoot, lock in, confirm, pencil, etc.)
 *    are placed in shoot_date_notes rather than shoot_date_start.
 *  - "Term: X weeks" and "Term: X months" are parsed as usage_duration_months.
 *  - "Territory:" and "Media:" labelled lines are extracted as raw text for review.
 *  - "Social" alone in a media context does NOT set deliverables_type to "Social".
 */

import type { UsageMedia, UsageTerritory } from '@/lib/types/database';

export type ParsedBrief = {
  shoot_location: string | null;
  shoot_date_start: string | null;   // YYYY-MM-DD
  shoot_date_end: string | null;     // YYYY-MM-DD
  shoot_date_notes: string | null;
  talent_count: number | null;
  talent_spec: string | null;
  deliverables_type: string | null;
  deliverables_count: number | null;
  usage_duration_months: number | null;
  /** Raw extracted territory text for review (e.g. "Australia"). */
  usage_territory_raw: string | null;
  /** Raw extracted media list text for review. */
  usage_media_raw: string | null;
  budget_indication: number | null;
};

// ============================================================
// Date parsing helpers
// ============================================================

const MONTHS: Record<string, number> = {
  january: 1, jan: 1, february: 2, feb: 2, march: 3, mar: 3,
  april: 4, apr: 4, may: 5, june: 6, jun: 6, july: 7, jul: 7,
  august: 8, aug: 8, september: 9, sep: 9, sept: 9, october: 10, oct: 10,
  november: 11, nov: 11, december: 12, dec: 12,
};

const MONTH_RE = 'jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|jun(?:e)?|jul(?:y)?|aug(?:ust)?|sep(?:t(?:ember)?)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?';
const ORD_SUFFIX = '(?:st|nd|rd|th)?'; // optional ordinal suffix: 1st, 2nd, 25th etc.

/** Convert numeric day/month/year to YYYY-MM-DD. Returns null if invalid. */
function toISO(day: string | number, month: string | number, year: string | number): string | null {
  const d = typeof day === 'string' ? parseInt(day, 10) : day;
  const y = typeof year === 'string' ? parseInt(year, 10) : year;
  let m: number;
  if (typeof month === 'number') {
    m = month;
  } else if (/^\d+$/.test(month)) {
    m = parseInt(month, 10);
  } else {
    m = MONTHS[month.toLowerCase()] ?? 0;
  }
  if (!d || !m || !y || d < 1 || d > 31 || m < 1 || m > 12 || y < 2020 || y > 2035) return null;
  return `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
}

/** Infer year for a month+day that has no year in the brief. */
function inferYear(monthNum: number, day: number): number {
  const now = new Date();
  const thisYear = now.getFullYear();
  // If the month/day has already passed this year, assume next year
  const thisDate = new Date(thisYear, monthNum - 1, day);
  return thisDate < now ? thisYear + 1 : thisYear;
}

/**
 * Try to parse a date range or single date from a string fragment.
 * Supports ordinal suffixes (1st, 2nd, 25th etc.) and bare month+day without year.
 */
function parseDateFragment(text: string): { start: string | null; end: string | null } {
  // Pattern: "15th–17th May 2026" or "15-17 May 2026"
  const rangeWithYear = new RegExp(
    `\\b(\\d{1,2})${ORD_SUFFIX}\\s*[–\\-]\\s*(\\d{1,2})${ORD_SUFFIX}\\s+(${MONTH_RE})\\s+(\\d{4})\\b`,
    'i',
  );
  const m1 = text.match(rangeWithYear);
  if (m1) {
    const [, d1, d2, mon, yr] = m1;
    return { start: toISO(d1, mon, yr), end: toISO(d2, mon, yr) };
  }

  // Pattern: "15th May 2026" (single day with year)
  const singleWithYear = new RegExp(
    `\\b(\\d{1,2})${ORD_SUFFIX}\\s+(${MONTH_RE})\\s+(\\d{4})\\b`,
    'i',
  );
  const m2 = text.match(singleWithYear);
  if (m2) {
    const [, d, mon, yr] = m2;
    const date = toISO(d, mon, yr);
    return { start: date, end: date };
  }

  // Pattern: "15/05/2026" or "15-05-2026" (numeric with year)
  const numericWithYear = text.match(/\b(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})\b/);
  if (numericWithYear) {
    const [, d, m, y] = numericWithYear;
    const date = toISO(d, m, y);
    return { start: date, end: date };
  }

  // Pattern: "3rd and 4th of March" / "3rd and 4th March" / "3 and 4 March"
  // (multi-day shoot expressed with "and" instead of a dash). Year inferred.
  const andRangeNoYear = new RegExp(
    `\\b(\\d{1,2})${ORD_SUFFIX}\\s+and\\s+(\\d{1,2})${ORD_SUFFIX}\\s+(?:of\\s+)?(${MONTH_RE})\\b(?!\\s+\\d{4})`,
    'i',
  );
  const mAnd = text.match(andRangeNoYear);
  if (mAnd) {
    const [, d1, d2, mon] = mAnd;
    const monthNum = MONTHS[mon.toLowerCase()] ?? 0;
    if (monthNum) {
      const yr = inferYear(monthNum, parseInt(d1, 10));
      return { start: toISO(d1, monthNum, yr), end: toISO(d2, monthNum, yr) };
    }
  }

  // Pattern: "15th May" or "15 May" (no year — infer from today)
  const singleNoYear = new RegExp(
    `\\b(\\d{1,2})${ORD_SUFFIX}\\s+(${MONTH_RE})\\b(?!\\s+\\d{4})`,
    'i',
  );
  const m3 = text.match(singleNoYear);
  if (m3) {
    const [, d, mon] = m3;
    const monthNum = MONTHS[mon.toLowerCase()] ?? 0;
    if (monthNum) {
      const dayNum = parseInt(d, 10);
      const yr = inferYear(monthNum, dayNum);
      const date = toISO(dayNum, monthNum, yr);
      return { start: date, end: date };
    }
  }

  return { start: null, end: null };
}

// ============================================================
// Context-aware date extraction
// ============================================================

/**
 * Lines or phrases that signal the following date is a LIVE / PUBLISH date —
 * NOT the shoot date. These are explicitly blocked from shoot_date_start.
 */
const LIVE_DATE_PATTERNS = [
  /\blive\s+date\s*:/i,
  /\bgo\s+live\s*(?:date\s*)?:/i,
  /\blaunch\s*(?:date\s*)?:/i,
  /\bpublication\s*(?:date\s*)?:/i,
  /\booh\s*(?:live\s*)?date\s*:/i,
  /\bair\s*date\s*:/i,
  /\bin[\s-]+store\s+(?:from\s+)?(?:date\s*)?:/i,
  /\bcampaign\s+(?:goes\s+)?live\s*:/i,
  /\bpublish\s*(?:date\s*)?:/i,
  /\brelease\s+date\s*:/i,
  /\bin[\s-]stores?\s*(?:from\s*)?\d/i,
];

/**
 * Phrases that strongly indicate the date being mentioned IS the shoot date.
 * Used to approve dates found in free-form text (not labelled lines).
 */
const SHOOT_DATE_TRIGGERS = [
  /\block(?:ing|ed)?\s+in\b/i,
  // Tightened from `/\bshoot\s+date\b/i` — the looser form matched the
  // referring phrase "the shoot date on 27 May" (which is talking ABOUT
  // a date, not declaring one) and corrupted the extracted value. Require
  // the date to follow a declarative marker (is | : | will/would be).
  /\bshoot\s+dates?\s*(?:is|:|will\s+be|would\s+be)\b/i,
  /\bshoot\s+on\b/i,
  /\bshooting\s+on\b/i,
  /\bshoot(?:ing)?\s+is\s+(?:on|the)\b/i,
  // "shoot a full day on", "shoot a half day on", "shoot a day on" — the
  // most common natural-language phrasing in our inbox.
  /\bshoot(?:ing)?\s+(?:a\s+)?(?:full\s+|half\s+)?day\s+on\b/i,
  // "for a full day ... on 20 May" — common in "is X free for a full
  // day on 20 May" style enquiries. Greedy `.{0,40}` capped to avoid
  // matching across paragraphs.
  /\bfor\s+(?:a\s+)?(?:full\s+|half\s+)?day\b.{0,40}\bon\s+\d/i,
  /\bphotograph(?:y|ed|ing)\s+on\b/i,
  /\bfilm(?:ing)?\s+on\b/i,
  /\bcaptur(?:e|ing)\s+on\b/i,
  /\bconfirm(?:ed|ing)?\s+(?:for\s+)?(?:the\s+)?\d/i,
  /\bpencil(?:led|ling)?\s+(?:for\s+)?(?:the\s+)?\d/i,
  /\bbook(?:ed|ing)?\s+(?:for\s+)?(?:the\s+)?\d/i,
  /\bwe\s*(?:are|'re)?\s+looking\s+to\s+(?:lock|book|confirm)\b/i,
  /\bproposed\s+(?:shoot\s+)?date\b/i,
  /\bschedule[d]?\s+for\b/i,
  /\bset\s+for\b/i,
  /\bavailable\s+(?:on|for)\b/i,
];

/**
 * Extract shoot dates from the brief text, being careful to:
 * 1. Skip dates that follow live-date signals
 * 2. Accept dates that follow shoot-date trigger phrases
 * 3. For all other dates found in free text, put them in dateNotes not dateStart
 */
function extractShootDates(text: string): {
  dateStart: string | null;
  dateEnd: string | null;
  dateNotes: string | null;
} {
  const lines = text.split(/\n+/);
  const liveLines = new Set<string>();

  // Tag lines that are live/launch dates
  for (const line of lines) {
    if (LIVE_DATE_PATTERNS.some((p) => p.test(line))) {
      liveLines.add(line);
    }
  }

  // 1. Look for explicit "Shoot Date:" / "Date:" / "Confirmed Date:" /
  //    "Shoot:" labels. Each requires a colon to count as a label — earlier
  //    versions accepted any whitespace, which incorrectly matched
  //    "1 x shoot date\n\nBrand  Inaura" (the "Brand Inaura" line was being
  //    captured as the date value). Anchored to line-start where possible.
  const labelPatterns = [
    /(?:^|\n)\s*(?:shoot\s+dates?|confirmed\s+date|proposed\s+date|schedule)\s*:\s*([^\n]+)/i,
    /^date[s]?\s*:\s*([^\n.]+)/im,
    // "Shoot: 20 May" — common in Post Prod Timeline blocks. Line-anchored
    // so it doesn't catch "shoot:" mid-sentence.
    /^shoot\s*:\s*([^\n.]+)/im,
  ];
  for (const pat of labelPatterns) {
    const m = text.match(pat);
    if (m) {
      const line = m[0];
      if (liveLines.has(line) || LIVE_DATE_PATTERNS.some((p) => p.test(line))) continue;
      const datePart = m[1].trim();
      const parsed = parseDateFragment(datePart);
      if (parsed.start) return { dateStart: parsed.start, dateEnd: parsed.end, dateNotes: null };
      if (datePart.length < 80) {
        return { dateStart: null, dateEnd: null, dateNotes: datePart };
      }
    }
  }

  // 2. Look for trigger phrases followed by a date within the same sentence/phrase
  for (const trigger of SHOOT_DATE_TRIGGERS) {
    const triggerMatch = text.search(trigger);
    if (triggerMatch === -1) continue;

    // Check that this trigger isn't in a live-date line
    const surroundingLine = text.slice(
      Math.max(0, triggerMatch - 20),
      Math.min(text.length, triggerMatch + 200),
    );
    if (LIVE_DATE_PATTERNS.some((p) => p.test(surroundingLine))) continue;

    // Try to parse a date from the surrounding context (next 120 chars after trigger)
    const afterTrigger = text.slice(triggerMatch, triggerMatch + 180);
    const parsed = parseDateFragment(afterTrigger);
    if (parsed.start) return { dateStart: parsed.start, dateEnd: parsed.end, dateNotes: null };
  }

  // 3. TBC / TBD check
  if (/\bshoot\s+dates?\s*(?:are\s+)?tbc\b|\bdate[s]?\s*:\s*tbc\b/i.test(text)) {
    return { dateStart: null, dateEnd: null, dateNotes: 'TBC' };
  }

  // 4. No confident shoot date found
  return { dateStart: null, dateEnd: null, dateNotes: null };
}

// ============================================================
// Usage duration extraction (Term: X weeks/months)
// ============================================================

function extractUsageDuration(text: string): number | null {
  // "Term: 4 weeks" / "Term: 2 months" / "4 month usage" etc.
  const patterns = [
    /\bterm\s*:\s*(\d+)\s*(week|month|year)s?\b/i,
    /(\d+)\s*(week|month|year)s?\s+(?:usage|licence|license|rights?|term)\b/i,
    /\busage\b[^.]*?(\d+)\s*(week|month|year)s?\b/i,
    /(\d+)\s*(week|month|year)s?\s+usage\b/i,
  ];
  for (const pat of patterns) {
    const m = text.match(pat);
    if (m) {
      const n = parseInt(m[1], 10);
      const unit = m[2].toLowerCase();
      if (unit.startsWith('week')) return Math.max(1, Math.round((n * 7) / 30));
      if (unit.startsWith('month')) return n;
      if (unit.startsWith('year')) return n * 12;
    }
  }
  // Bare "1 year" without "usage" nearby (only if no longer pattern matched)
  const yearMatch = text.match(/\b(\d+)\s+year(?:s)?\b/i);
  if (yearMatch) {
    const n = parseInt(yearMatch[1], 10);
    if (n >= 1 && n <= 5) return n * 12;
  }
  return null;
}

// ============================================================
// Territory extraction
// ============================================================

function extractTerritory(text: string): string | null {
  // "Territory: Australia" / "Territories: AU, NZ" etc.
  const m = text.match(/\bterrit(?:ory|ories)\s*:\s*([^\n.]+)/i);
  if (m) return m[1].trim().slice(0, 200);
  return null;
}

// ============================================================
// Media extraction
// ============================================================

function extractMedia(text: string): string | null {
  // "Media: Front of store POS, Paid social, digital display..."
  // Stop at: newline, a period followed by another label keyword, or a bare ". [CAPS]" indicator
  const m = text.match(/\bmedia\s*:\s*([\s\S]+?)(?:\n|(?:\s*\.\s*(?:territory|term|live date|go live|duration|budget|talent|location)\b)|$)/i);
  if (m) return m[1].trim().replace(/\s*\.\s*$/, '').slice(0, 300);
  return null;
}

// ============================================================
// Main parser
// ============================================================

export function parseBrief(text: string): ParsedBrief {
  if (!text || text.trim().length === 0) {
    return {
      shoot_location: null, shoot_date_start: null, shoot_date_end: null,
      shoot_date_notes: null, talent_count: null, talent_spec: null,
      deliverables_type: null, deliverables_count: null,
      usage_duration_months: null, usage_territory_raw: null,
      usage_media_raw: null, budget_indication: null,
    };
  }

  // ---- Shoot dates (context-aware) ----
  const { dateStart, dateEnd, dateNotes } = extractShootDates(text);

  // ---- Location ----
  let location: string | null = null;
  const locationPatterns = [
    /(?:shoot\s+)?location[:\s]+([^\n.]+)/i,
    /(?:at|@)\s+(studio\s+[\w\d]+[^\n,]*)/i,
    /(studio\s+[\w\d]+[^\n,]*)/i,
    /(?:at\s+)([\w\s]+(?:studio|warehouse|rooftop|location|space)[^\n,]*)/i,
  ];
  for (const pat of locationPatterns) {
    const m = text.match(pat);
    if (m) {
      // Strip trailing sentence punctuation that the "(?:studio|warehouse|
      // rooftop|location|space)[^\n,]*" pattern can swallow — without this
      // we end up with "Lunar Studios." (trailing period from end-of-sentence).
      location = m[1].trim().replace(/[.,;:!?]+$/, '').trim().slice(0, 100);
      break;
    }
  }

  // ---- Budget ----
  let budget: number | null = null;
  const budgetMatch = text.match(
    /(?:budget|fee|total)[^\n]*?\$\s*([0-9,]+(?:\.\d{2})?)\b/i
  ) ?? text.match(/\$\s*([0-9,]+(?:\.\d{2})?)\b/);
  if (budgetMatch) {
    const raw = budgetMatch[1].replace(/,/g, '');
    const parsed = parseFloat(raw);
    if (parsed >= 500 && parsed <= 500000) budget = parsed;
  }

  // ---- Talent count ----
  let talentCount: number | null = null;
  const lower = text.toLowerCase();
  const talentCountMatch = lower.match(
    /(\d+)\s+(?:[\w\-/]+\s+){0,3}(?:models?|talent|artists?|subjects?)\b/
  ) ?? lower.match(/(?:models?|talent|artists?)\s*[:\-]?\s*(\d+)/);
  if (talentCountMatch) {
    const n = parseInt(talentCountMatch[1], 10);
    if (n > 0 && n <= 50) talentCount = n;
  }

  // ---- Talent spec ----
  let talentSpec: string | null = null;
  const talentSpecMatch = text.match(
    /(?:talent\s+spec|looking\s+for|we\s+need)[:\s]+([^\n.]+)/i
  );
  if (talentSpecMatch) talentSpec = talentSpecMatch[1].trim().slice(0, 200);
  else if (talentCount) {
    const genderMatch = lower.match(/(female|male|non[-\s]binary)/);
    talentSpec = `${talentCount} ${genderMatch ? genderMatch[1] : ''} model${talentCount > 1 ? 's' : ''}`.trim();
  }

  // ---- Deliverables type ----
  // IMPORTANT: Check for a "Media:" line first and exclude that segment from
  // deliverables detection, since media labels often contain words like "social"
  // and "digital" that would otherwise be picked up as deliverable types.
  let deliverablesType: string | null = null;
  let deliverablesCount: number | null = null;

  // Strip the Media: line before scanning for deliverable keywords
  const textWithoutMediaLine = text.replace(/\bmedia\s*:[^\n]*/gi, '');

  const deliverableTypes: string[] = [];
  if (/\bstills?\b/i.test(textWithoutMediaLine)) deliverableTypes.push('Stills');
  if (/\bvideo\b|\bfilm\b|\bmotion\b|\breels?\b/i.test(textWithoutMediaLine)) deliverableTypes.push('Video');
  if (/\bbts\b|behind[\s-]the[\s-]scenes\b/i.test(textWithoutMediaLine)) deliverableTypes.push('BTS');
  if (/\becomm\b|e[\s-]comm(?:erce)?\b|\bpack(?:shot|aging)\b/i.test(textWithoutMediaLine)) deliverableTypes.push('eComm');
  if (/\bcampaign\s+(?:images?|photography|stills?|content)\b/i.test(textWithoutMediaLine)) deliverableTypes.push('Campaign');
  // "social" as a deliverable only if explicitly described as content type, not as media placement
  if (/\bsocial\s+(?:media\s+)?(?:content|images?|stills?|assets?|reels?)\b/i.test(textWithoutMediaLine)) deliverableTypes.push('Social content');
  if (deliverableTypes.length > 0) deliverablesType = deliverableTypes.join(' + ');

  const delivCountMatch = text.match(
    /(\d+)\s+(?:hero\s+)?(?:images?|selects?|shots?|deliverables?|stills?|files?)\b/i
  );
  if (delivCountMatch) {
    const n = parseInt(delivCountMatch[1], 10);
    if (n > 0 && n <= 10000) deliverablesCount = n;
  }

  // ---- Usage fields ----
  const usageDurationMonths = extractUsageDuration(text);
  const usageTerritoryRaw = extractTerritory(text);
  const usageMediaRaw = extractMedia(text);

  return {
    shoot_location: location,
    shoot_date_start: dateStart,
    shoot_date_end: dateEnd,
    shoot_date_notes: dateNotes,
    talent_count: talentCount,
    talent_spec: talentSpec,
    deliverables_type: deliverablesType,
    deliverables_count: deliverablesCount,
    usage_duration_months: usageDurationMonths,
    usage_territory_raw: usageTerritoryRaw,
    usage_media_raw: usageMediaRaw,
    budget_indication: budget,
  };
}

// ============================================================
// Raw → enum mappers (for usage_territory[] and usage_media[])
// ============================================================
//
// These are forgiving lookups: tokenise on common separators, normalise
// (lowercase, strip non-alpha), then look up against a synonym table.
// Anything that doesn't match comes back as `unmatched` so the caller can
// store the residue in usage_notes if it's worth keeping.

const TERRITORY_LOOKUP: Record<string, UsageTerritory> = {
  // Worldwide / Global
  worldwide: 'worldwide', global: 'worldwide', ww: 'worldwide', world: 'worldwide',
  allterritories: 'worldwide', allregions: 'worldwide',
  // Australia
  australia: 'australia', au: 'australia', aus: 'australia', aussie: 'australia',
  // Oceania (incl. NZ)
  oceania: 'oceania', nz: 'oceania', newzealand: 'oceania', anz: 'oceania', aunz: 'oceania',
  // North America
  usa: 'usa', us: 'usa', unitedstates: 'usa', america: 'usa',
  northamerica: 'north_america', na: 'north_america',
  // UK
  uk: 'uk', unitedkingdom: 'uk', britain: 'uk', greatbritain: 'uk', gb: 'uk', england: 'uk',
  // Europe
  europe: 'europe_all', eu: 'europe_eu', europeanunion: 'europe_eu', europeall: 'europe_all',
  europenoneu: 'europe_non_eu', noneueurope: 'europe_non_eu',
  nordics: 'nordics', scandinavia: 'nordics',
  cee: 'cee',
  // Asia
  asia: 'asia_incl_japan', asiainclujapan: 'asia_incl_japan', asiainc: 'asia_incl_japan',
  asiaexclujapan: 'asia_excl_japan', asiaexc: 'asia_excl_japan',
  japan: 'asia_incl_japan',
  // Middle East / Africa
  middleeast: 'middle_east', me: 'middle_east',
  mea: 'mea', emea: 'emea', amet: 'amet',
  africa: 'africa',
  uae: 'uae', dubai: 'uae',
  gcc: 'gcc',
  // Latin / Central / South America
  southamerica: 'south_america', sa: 'south_america',
  centralamerica: 'central_america',
  caribbean: 'caribbean',
  latinamerica: 'latin_america', latam: 'latin_america',
};

const MEDIA_LOOKUP: Record<string, UsageMedia> = {
  // Catch-alls
  allmedia: 'all_media', everymedia: 'all_media',
  allprint: 'all_print', print: 'all_print', printcollateral: 'all_print',
  alldigital: 'all_digital', digital: 'all_digital', alldigitalmedia: 'all_digital',
  // Print
  ooh: 'ooh', outofhome: 'ooh', billboards: 'ooh', billboard: 'ooh',
  press: 'press', magazines: 'press', magazine: 'press', newspaper: 'press',
  brochures: 'brochures', brochure: 'brochures',
  packaging: 'packaging', packaged: 'packaging',
  pos: 'pos', pointofsale: 'pos', frontofstore: 'pos', instore: 'pos', incentre: 'pos',
  posstand: 'pos', windows: 'pos', gates: 'pos',
  directmail: 'direct_mail', dm: 'direct_mail',
  posters: 'posters', poster: 'posters',
  collateral: 'collateral',
  prprint: 'pr_print',
  // Digital
  social: 'social_media', socialmedia: 'social_media', paidsocial: 'social_media',
  organicsocial: 'social_media', socials: 'social_media',
  companywebsite: 'company_website', website: 'company_website', web: 'company_website',
  regionalwebsite: 'regional_website',
  internetadvertising: 'internet_advertising', internetads: 'internet_advertising',
  displayads: 'internet_advertising', programmatic: 'internet_advertising',
  digitalposters: 'digital_posters',
  digitaldirectmail: 'digital_direct_mail', edm: 'digital_direct_mail', email: 'digital_direct_mail',
  mobile: 'mobile', mobileads: 'mobile',
  intranet: 'intranet',
  prdigital: 'pr_digital',
  tv: 'tv', broadcast: 'tv', television: 'tv',
  // Other
  ambient: 'ambient',
  marketingaids: 'marketing_aids',
};

function normaliseToken(s: string): string {
  return s.toLowerCase().replace(/[^a-z]/g, '');
}

function tokeniseRaw(raw: string): string[] {
  return raw
    .split(/[,;/&\n]|\s+(?:and|plus)\s+/i)
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
}

export type EnumMapResult<T> = {
  matched: T[];
  /** Tokens that did not map to any known enum value. */
  unmatched: string[];
};

/**
 * For a single token, find ALL known keys that appear as substrings of the
 * normalised form, prefering longer keys first (so "frontofstore" wins over
 * "front" if both existed). Returns the matched enum values in order.
 */
function matchTokenSubstrings<T extends string>(
  token: string,
  lookup: Record<string, T>,
  keysByLengthDesc: string[],
): T[] {
  const normalised = normaliseToken(token);
  if (normalised.length === 0) return [];

  // Whole-token exact hit is the cheapest path
  const exact = lookup[normalised];
  if (exact) return [exact];

  // Otherwise consume substrings greedily, longest first
  const hits: T[] = [];
  let remaining = normalised;
  for (const key of keysByLengthDesc) {
    const idx = remaining.indexOf(key);
    if (idx === -1) continue;
    const value = lookup[key];
    if (!hits.includes(value)) hits.push(value);
    // Remove this key from the remaining pool so we don't double-count
    remaining = remaining.slice(0, idx) + remaining.slice(idx + key.length);
    if (remaining.length === 0) break;
  }
  return hits;
}

const TERRITORY_KEYS_DESC = Object.keys(TERRITORY_LOOKUP).sort((a, b) => b.length - a.length);
const MEDIA_KEYS_DESC = Object.keys(MEDIA_LOOKUP).sort((a, b) => b.length - a.length);

/** Map free-text territory like "Australia & NZ" → ['australia', 'oceania']. */
export function mapTerritoryRaw(raw: string | null | undefined): EnumMapResult<UsageTerritory> {
  if (!raw) return { matched: [], unmatched: [] };
  const tokens = tokeniseRaw(raw);
  const matched = new Set<UsageTerritory>();
  const unmatched: string[] = [];
  for (const token of tokens) {
    const hits = matchTokenSubstrings(token, TERRITORY_LOOKUP, TERRITORY_KEYS_DESC);
    if (hits.length > 0) hits.forEach((h) => matched.add(h));
    else unmatched.push(token);
  }
  return { matched: [...matched], unmatched };
}

/** Map free-text media list like "Front of store POS, Paid social" → ['pos', 'social_media']. */
export function mapMediaRaw(raw: string | null | undefined): EnumMapResult<UsageMedia> {
  if (!raw) return { matched: [], unmatched: [] };
  const tokens = tokeniseRaw(raw);
  const matched = new Set<UsageMedia>();
  const unmatched: string[] = [];
  for (const token of tokens) {
    const hits = matchTokenSubstrings(token, MEDIA_LOOKUP, MEDIA_KEYS_DESC);
    if (hits.length > 0) hits.forEach((h) => matched.add(h));
    else unmatched.push(token);
  }
  return { matched: [...matched], unmatched };
}
