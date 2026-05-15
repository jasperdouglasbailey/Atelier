/**
 * Location Website Parser
 *
 * Given a studio's public website URL, fetches the page (and up to 4 same-
 * domain sub-pages that look like rooms/studios/rates), strips HTML to plain
 * text, and feeds the combined text to Claude with a structured extraction
 * schema mirroring the `atelier_locations` columns.
 *
 * Doctrine:
 *   - Never auto-applies. The form layer shows the parsed result with
 *     per-field "AI" badges and lets Jasper review before save.
 *   - Kill-switch gated (uses callLLMJson which already respects it).
 *   - Logged to atelier_llm_calls for cost tracking.
 *   - Returns null if the LLM is unavailable — the form layer falls back
 *     to manual entry.
 *
 * Sub-page crawling: only same-host links whose URL path contains one of
 * the keyword stems below, max 4 pages, max 30KB of text per page. This
 * keeps the LLM payload small (~$0.01 per parse on Sonnet) while still
 * picking up per-room detail pages on most studio sites.
 */

import { callLLM } from '@/lib/integrations/anthropic';
import type { StudioType, StudioRoom } from '@/lib/types/database';

const SUB_PAGE_KEYWORDS = [
  'studio', 'room', 'space', 'spaces', 'hire', 'rate', 'pricing', 'rooms', 'studios', 'about', 'facilities',
];

const MAX_SUB_PAGES = 4;
const MAX_TEXT_PER_PAGE = 30_000; // chars
const MAX_TOTAL_TEXT = 80_000;    // chars across all pages

const FETCH_TIMEOUT_MS = 15_000;
const FETCH_USER_AGENT = 'Atelier-Platform-LocationParser/1.0 (parsing public studio listings)';

export type ParsedLocation = {
  /** What the parser is confident is the canonical studio/venue name. */
  name: string | null;
  alias: string | null;
  /** Detected studio_type — fallback 'photo_studio' if unclear. */
  studio_type: StudioType | null;
  address: string | null;
  suburb: string | null;
  state: string | null;
  postcode: string | null;
  contact_name: string | null;
  contact_email: string | null;
  contact_phone: string | null;
  website: string | null;
  half_day_rate: number | null;
  full_day_rate: number | null;
  weekend_surcharge_pct: number | null;
  rate_notes: string | null;
  facilities: string[];
  parking_notes: string | null;
  access_notes: string | null;
  square_metres: number | null;
  max_capacity: number | null;
  /** Per-room breakdown when the site advertises multiple rooms. Each room
   *  gets a generated UUID-shaped id by the action layer before save. */
  studio_rooms: Array<Omit<StudioRoom, 'id'>>;
  /** Free-text summary of anything else worth knowing — saved to notes. */
  notes: string | null;
  /** 0-100 — how confident the LLM is in the overall extraction. */
  confidence: number;
  /** What the LLM couldn't determine or had to guess. */
  uncertainty: string[];
  /** Pages that were fetched + parsed. */
  sourceUrls: string[];
};

/** Stripped-down ParsedLocation used internally before adding sourceUrls. */
type LlmParsedLocation = Omit<ParsedLocation, 'sourceUrls'>;

/**
 * Discriminated result so callers can show specific error UX instead of a
 * generic "could not parse". Maps to user-readable messages in the server
 * action layer.
 */
export type ParseResult =
  | { ok: true; parsed: ParsedLocation }
  | { ok: false; reason: 'invalid_url' }
  | { ok: false; reason: 'fetch_failed'; url: string }
  | { ok: false; reason: 'llm_unavailable' }
  | { ok: false; reason: 'llm_blocked' }
  | { ok: false; reason: 'llm_invalid_response' };

const FACILITY_KEYS = [
  'change_rooms', 'kitchen', 'wifi', 'lighting_rig', 'cyclorama', 'green_room',
  'parking_onsite', 'parking_nearby', 'loading_dock', 'wardrobe_room',
  'makeup_room', 'shower', 'air_conditioning', 'natural_light', 'blackout',
  'sound_proofing', 'rooftop', 'kitchen_full',
];

const STUDIO_TYPES: StudioType[] = [
  'photo_studio', 'film_studio', 'outdoor', 'retail', 'residential', 'venue', 'other',
];

// ============================================================
// HTML → text
// ============================================================

/**
 * Lightweight HTML-to-text. Avoids cheerio/jsdom to keep the bundle slim.
 * Drops <script>/<style>/<noscript>/<svg>, collapses whitespace, decodes a
 * handful of common entities. Good enough for the studio sites we'll see —
 * static HTML or server-rendered Next/WP/Squarespace.
 */
function htmlToText(html: string): string {
  return html
    // Strip tags whose content we don't want at all
    .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '')
    .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
    .replace(/<noscript[^>]*>[\s\S]*?<\/noscript>/gi, '')
    .replace(/<svg[^>]*>[\s\S]*?<\/svg>/gi, '')
    // Replace block-ish tags with newlines so paragraph structure survives
    .replace(/<\/?(?:p|br|div|li|h[1-6]|tr|table|section|article|header|footer|main|nav|ul|ol)[^>]*>/gi, '\n')
    // Drop all other tags
    .replace(/<[^>]+>/g, ' ')
    // Decode common entities
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&[a-z]+;/gi, ' ')
    // Collapse whitespace
    .replace(/[ \t]+/g, ' ')
    .replace(/\n\s*\n+/g, '\n\n')
    .trim();
}

/**
 * Find same-host links that look like room/rate/spaces pages worth following.
 * Returns absolute URLs, deduplicated, capped at MAX_SUB_PAGES.
 */
function findRelevantSubPages(html: string, baseUrl: URL): string[] {
  const linkRe = /<a[^>]*\bhref\s*=\s*['"]([^'"#]+)['"][^>]*>/gi;
  const candidates = new Set<string>();

  let m: RegExpExecArray | null;
  while ((m = linkRe.exec(html))) {
    const href = m[1];
    if (!href) continue;
    // Skip mailto/tel/javascript/anchor-only
    if (/^(?:mailto:|tel:|javascript:|#)/i.test(href)) continue;

    let abs: URL;
    try {
      abs = new URL(href, baseUrl);
    } catch {
      continue;
    }
    // Same host only
    if (abs.host !== baseUrl.host) continue;
    // Avoid file downloads
    if (/\.(pdf|jpg|jpeg|png|gif|webp|svg|mp4|mp3|zip|doc|docx)(?:\?|$)/i.test(abs.pathname)) continue;
    // Must hit a keyword
    const pathLower = abs.pathname.toLowerCase();
    if (!SUB_PAGE_KEYWORDS.some((k) => pathLower.includes(k))) continue;
    // Skip the base URL itself
    if (abs.href === baseUrl.href) continue;

    candidates.add(abs.href);
    if (candidates.size >= MAX_SUB_PAGES) break;
  }
  return Array.from(candidates);
}

/**
 * Fetch a single URL with a timeout and proper headers. Returns null when
 * the request fails or response is non-HTML.
 */
async function fetchHtml(url: string): Promise<string | null> {
  try {
    const response = await fetch(url, {
      headers: {
        'User-Agent': FETCH_USER_AGENT,
        'Accept': 'text/html,application/xhtml+xml',
        'Accept-Language': 'en-AU,en;q=0.9',
      },
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
      redirect: 'follow',
    });

    if (!response.ok) return null;
    const ct = response.headers.get('content-type') ?? '';
    if (!ct.includes('text/html') && !ct.includes('xhtml')) return null;
    return await response.text();
  } catch {
    return null;
  }
}

// ============================================================
// LLM extraction
// ============================================================

function buildSystemPrompt(): string {
  return `You are extracting structured data about a photography / production studio from its public website.

You will receive the visible text from the studio's homepage and (optionally) a few sub-pages.

Return a JSON object with these exact keys:

{
  "name": string|null,                  // Studio / venue's canonical name
  "alias": string|null,                 // Short name if commonly used (e.g. "S5"), else null
  "studio_type": "photo_studio"|"film_studio"|"outdoor"|"retail"|"residential"|"venue"|"other"|null,
  "address": string|null,               // Street address (number + street)
  "suburb": string|null,                // Sydney suburb
  "state": string|null,                 // "NSW", "VIC", etc.
  "postcode": string|null,
  "contact_name": string|null,
  "contact_email": string|null,
  "contact_phone": string|null,         // Australian format preferred
  "website": string|null,               // Their canonical URL
  "half_day_rate": number|null,         // AUD, ex-GST, per half day
  "full_day_rate": number|null,         // AUD, ex-GST, per full day
  "weekend_surcharge_pct": number|null, // 0.25 means 25% surcharge
  "rate_notes": string|null,            // "Power included; catering separate"
  "facilities": string[],               // Pick from: ${FACILITY_KEYS.join(', ')}
  "parking_notes": string|null,
  "access_notes": string|null,
  "square_metres": number|null,
  "max_capacity": number|null,          // Number of people
  "studio_rooms": [{                    // Empty array if single-room
    "name": string,                     // "Studio 1", "Studio A", "The Atrium"
    "half_day_rate": number|null,
    "full_day_rate": number|null,
    "weekend_surcharge_pct": number|null,
    "square_metres": number|null,
    "max_capacity": number|null,
    "features": string[],               // Free-form list of room-specific features
    "notes": string|null
  }],
  "notes": string|null,                 // Anything else useful, in one paragraph
  "confidence": number,                 // 0-100, your overall confidence
  "uncertainty": string[]               // Fields you guessed or couldn't determine
}

Rules:
- Use null for any field you can't determine — never invent.
- If the studio has multiple named rooms/spaces, populate studio_rooms with one entry per room.
- If only ONE room is shown, leave studio_rooms as []. Don't duplicate the top-level rates into a single room.
- Strip dollar signs and commas from rates ("$2,200" → 2200).
- Australian English. Default state="NSW" only if explicit. If you can't tell, leave null.
- For facilities, only use keys from the allowed list above. Omit anything that doesn't fit.
- For confidence: 80+ means the site was clear and detailed. 50-79 means partial info. <50 means very sparse — return what you have but flag it.
- For uncertainty: list specific fields you guessed at or couldn't find. e.g. "weekend_surcharge_pct (not mentioned)", "square_metres (no exact number, estimated from room descriptions)".`;
}

function validateParsed(data: unknown): data is LlmParsedLocation {
  if (typeof data !== 'object' || data === null) return false;
  const obj = data as Record<string, unknown>;
  // Minimum viable: confidence must be a number and uncertainty/studio_rooms must be arrays.
  if (typeof obj.confidence !== 'number') return false;
  if (!Array.isArray(obj.uncertainty)) return false;
  if (!Array.isArray(obj.studio_rooms)) return false;
  if (!Array.isArray(obj.facilities)) return false;
  return true;
}

// ============================================================
// Public entry point
// ============================================================

export async function parseLocationFromUrl(rawUrl: string): Promise<ParseResult> {
  let baseUrl: URL;
  try {
    baseUrl = new URL(rawUrl.startsWith('http') ? rawUrl : `https://${rawUrl}`);
  } catch {
    return { ok: false, reason: 'invalid_url' };
  }

  const homepageHtml = await fetchHtml(baseUrl.href);
  if (!homepageHtml) {
    console.error('[location-parser] Failed to fetch', baseUrl.href);
    return { ok: false, reason: 'fetch_failed', url: baseUrl.href };
  }

  // Discover sub-pages worth following
  const subPageUrls = findRelevantSubPages(homepageHtml, baseUrl);
  const sourceUrls = [baseUrl.href, ...subPageUrls];

  // Fetch in parallel (small N, polite to the host because they're all same-origin)
  const subPageHtmls = await Promise.all(
    subPageUrls.map((u) => fetchHtml(u).then((html) => ({ url: u, html }))),
  );

  // Build the LLM payload — homepage first, then each sub-page labelled
  let payload = `=== HOMEPAGE: ${baseUrl.href} ===\n\n${htmlToText(homepageHtml).slice(0, MAX_TEXT_PER_PAGE)}`;

  for (const { url, html } of subPageHtmls) {
    if (!html) continue;
    const text = htmlToText(html).slice(0, MAX_TEXT_PER_PAGE);
    const chunk = `\n\n=== PAGE: ${url} ===\n\n${text}`;
    if (payload.length + chunk.length > MAX_TOTAL_TEXT) break;
    payload += chunk;
  }

  // Call LLM directly so we can distinguish failure reasons (no API key vs
  // kill switch vs invalid JSON vs API error) for clear user-facing errors.
  const systemPromptForJson = buildSystemPrompt() + '\n\nRespond with valid JSON only. No markdown fences, no explanation. Just the JSON object.';
  const llmResponse = await callLLM({
    purpose: 'location_website_parse',
    systemPrompt: systemPromptForJson,
    messages: [{ role: 'user', content: payload }],
    model: 'claude-3-5-sonnet-20241022',
    maxTokens: 4000,
  });

  if (!llmResponse.ok) {
    if (llmResponse.reason === 'no_api_key') return { ok: false, reason: 'llm_unavailable' };
    if (llmResponse.reason === 'kill_switch') return { ok: false, reason: 'llm_blocked' };
    return { ok: false, reason: 'llm_invalid_response' };
  }

  let parsed: LlmParsedLocation;
  try {
    const cleaned = llmResponse.text.replace(/^```(?:json)?\n?|```$/gm, '').trim();
    const obj = JSON.parse(cleaned) as unknown;
    if (!validateParsed(obj)) {
      console.error('[location-parser] LLM returned invalid JSON shape', obj);
      return { ok: false, reason: 'llm_invalid_response' };
    }
    parsed = obj;
  } catch (err) {
    console.error('[location-parser] JSON parse failed', err, llmResponse.text.slice(0, 200));
    return { ok: false, reason: 'llm_invalid_response' };
  }

  // Clamp studio_type to valid enum + clamp confidence
  const studioType = parsed.studio_type && STUDIO_TYPES.includes(parsed.studio_type)
    ? parsed.studio_type
    : null;
  const facilities = parsed.facilities.filter((f): f is string => typeof f === 'string' && FACILITY_KEYS.includes(f));

  return {
    ok: true,
    parsed: {
      ...parsed,
      studio_type: studioType,
      facilities,
      confidence: Math.max(0, Math.min(100, Math.round(parsed.confidence))),
      sourceUrls,
    },
  };
}
