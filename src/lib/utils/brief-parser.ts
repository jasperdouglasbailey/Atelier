/**
 * Heuristic brief parser — extracts structured fields from raw brief/email text.
 * No LLM required; uses regex patterns common to Sydney commercial photography briefs.
 *
 * Returns a Partial<ParsedBrief> — only fields confidently extracted are set.
 * The caller should present these as suggestions, not auto-apply them.
 */

export type ParsedBrief = {
  shoot_location: string | null;
  shoot_date_start: string | null;   // YYYY-MM-DD
  shoot_date_end: string | null;     // YYYY-MM-DD (same as start for single day)
  shoot_date_notes: string | null;
  talent_count: number | null;
  talent_spec: string | null;
  deliverables_type: string | null;
  deliverables_count: number | null;
  usage_duration_months: number | null;
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

/** Convert "15 May 2026" style or "15/05/2026" to YYYY-MM-DD. Returns null if unparseable. */
function toISO(day: string, month: string, year: string): string | null {
  const d = parseInt(day, 10);
  const y = parseInt(year, 10);
  let m: number;
  if (/^\d+$/.test(month)) {
    m = parseInt(month, 10);
  } else {
    m = MONTHS[month.toLowerCase()] ?? 0;
  }
  if (!d || !m || !y || d < 1 || d > 31 || m < 1 || m > 12 || y < 2020 || y > 2035) return null;
  return `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
}

/** Try to parse a date range or single date from a string fragment. */
function parseDateFragment(text: string): { start: string | null; end: string | null } {
  // Pattern: "15–17 May 2026" or "15-17 May 2026"
  const rangeWordMatch = text.match(
    /\b(\d{1,2})\s*[–\-]\s*(\d{1,2})\s+(jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|jun(?:e)?|jul(?:y)?|aug(?:ust)?|sep(?:t(?:ember)?)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)\s+(\d{4})\b/i
  );
  if (rangeWordMatch) {
    const [, d1, d2, mon, yr] = rangeWordMatch;
    return { start: toISO(d1, mon, yr), end: toISO(d2, mon, yr) };
  }

  // Pattern: "15 May 2026" (single day)
  const singleWordMatch = text.match(
    /\b(\d{1,2})\s+(jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|jun(?:e)?|jul(?:y)?|aug(?:ust)?|sep(?:t(?:ember)?)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)\s+(\d{4})\b/i
  );
  if (singleWordMatch) {
    const [, d, mon, yr] = singleWordMatch;
    const date = toISO(d, mon, yr);
    return { start: date, end: date };
  }

  // Pattern: "15/05/2026" or "15-05-2026"
  const numericMatch = text.match(/\b(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})\b/);
  if (numericMatch) {
    const [, d, m, y] = numericMatch;
    const date = toISO(d, m, y);
    return { start: date, end: date };
  }

  return { start: null, end: null };
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
      usage_duration_months: null, budget_indication: null,
    };
  }

  const lower = text.toLowerCase();

  // ---- Shoot dates ----
  // Look for "shoot date(s):", "date:", "shoot:", "confirmed date:" patterns
  let dateStart: string | null = null;
  let dateEnd: string | null = null;
  let dateNotes: string | null = null;

  const dateLineMatch = text.match(
    /(?:shoot\s+dates?|date[s]?|confirmed\s+date|schedule)[:\s]+([^\n.]+)/i
  );
  if (dateLineMatch) {
    const datePart = dateLineMatch[1].trim();
    const parsed = parseDateFragment(datePart);
    dateStart = parsed.start;
    dateEnd = parsed.end;
    // If we got text but couldn't parse dates, save as notes
    if (!dateStart && datePart.length < 80 && !datePart.toLowerCase().includes('tbd')) {
      dateNotes = datePart;
    }
    if (datePart.toLowerCase().includes('tbc') || datePart.toLowerCase().includes('tbd')) {
      dateNotes = 'TBC';
    }
  } else {
    // Fallback: scan whole text for date patterns
    const parsed = parseDateFragment(text);
    dateStart = parsed.start;
    dateEnd = parsed.end;
  }

  // ---- Location ----
  let location: string | null = null;
  const locationPatterns = [
    /(?:shoot\s+)?location[:\s]+([^\n.]+)/i,
    /(?:at|@)\s+(studio\s+\d+[^\n,]*)/i,
    /(studio\s+\d+[^\n,]*)/i,
    /(?:at\s+)([\w\s]+(?:studio|warehouse|rooftop|location|space)[^\n,]*)/i,
  ];
  for (const pat of locationPatterns) {
    const m = text.match(pat);
    if (m) {
      location = m[1].trim().slice(0, 100);
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
    // Sanity check: only accept reasonable photo agency budgets $500–$500,000
    if (parsed >= 500 && parsed <= 500000) budget = parsed;
  }

  // ---- Talent count ----
  let talentCount: number | null = null;
  const talentCountMatch = lower.match(
    /(\d+)\s+(?:models?|talent|artists?|subjects?)/
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
    // Build from count
    const genderMatch = lower.match(/(female|male|non[-\s]binary)/);
    talentSpec = `${talentCount} ${genderMatch ? genderMatch[1] : ''} model${talentCount > 1 ? 's' : ''}`.trim();
  }

  // ---- Deliverables ----
  let deliverablesType: string | null = null;
  let deliverablesCount: number | null = null;

  const deliverableTypes: string[] = [];
  if (/\bstills?\b/i.test(text)) deliverableTypes.push('Stills');
  if (/\bvideo\b|\bfilm\b|\bmotion\b|\breels?\b/i.test(text)) deliverableTypes.push('Video');
  if (/\bbts\b|behind[\s-]the[\s-]scenes\b/i.test(text)) deliverableTypes.push('BTS');
  if (/\becomm\b|e[\s-]comm(?:erce)?\b|\bpack(?:shot|aging)\b/i.test(text)) deliverableTypes.push('eComm');
  if (/\bcampaign\b/i.test(text)) deliverableTypes.push('Campaign');
  if (/\bsocial\b/i.test(text)) deliverableTypes.push('Social');
  if (deliverableTypes.length > 0) deliverablesType = deliverableTypes.join(' + ');

  const delivCountMatch = text.match(
    /(\d+)\s+(?:hero\s+)?(?:images?|selects?|shots?|deliverables?|stills?|files?)\b/i
  );
  if (delivCountMatch) {
    const n = parseInt(delivCountMatch[1], 10);
    if (n > 0 && n <= 10000) deliverablesCount = n;
  }

  // ---- Usage duration ----
  let usageDurationMonths: number | null = null;
  const usageMatch = text.match(
    /(\d+)[\s-]?(?:month|mth|yr|year)s?\s+(?:usage|licence|license|rights?|term)/i
  ) ?? text.match(/usage[^.]*?(\d+)[\s-]?(?:month|mth)s?/i);
  if (usageMatch) {
    const n = parseInt(usageMatch[1], 10);
    const isYears = /yr|year/.test(usageMatch[0]);
    usageDurationMonths = isYears ? n * 12 : n;
  }
  // Also look for "1 year" without "usage" keyword nearby
  if (!usageDurationMonths) {
    const yearMatch = text.match(/\b(\d+)\s+year(?:s)?\b/i);
    if (yearMatch && parseInt(yearMatch[1], 10) <= 5) {
      usageDurationMonths = parseInt(yearMatch[1], 10) * 12;
    }
  }

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
    budget_indication: budget,
  };
}
