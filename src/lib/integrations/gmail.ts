/**
 * Gmail Integration — production-ready send + draft + send-draft.
 *
 * Doctrine: Client ↔ Artist never direct. All comms relay through Saunders & Co.
 *
 * Implementation: raw fetch against Gmail REST v1 (no SDK, matches anthropic.ts
 * style and keeps cold starts lean). Auth via shared OAuth client in
 * google-auth.ts. Messages are RFC-5322 with base64url body per Gmail API.
 *
 * Stays a no-op (logs only) when GOOGLE_REFRESH_TOKEN isn't set, so dev
 * environments without real creds don't crash and don't try to send.
 */

import { isGoogleConfigured, getAccessToken } from './google-auth';

const GMAIL_USER = 'me';
const SEND_URL = `https://gmail.googleapis.com/gmail/v1/users/${GMAIL_USER}/messages/send`;
const DRAFTS_URL = `https://gmail.googleapis.com/gmail/v1/users/${GMAIL_USER}/drafts`;

export interface EmailInput {
  to: string[];
  cc?: string[];
  bcc?: string[];
  subject: string;
  body: string;        // HTML body
  bodyType?: 'html' | 'text';
  attachments?: {
    name: string;
    contentType: string;
    contentBase64: string;
  }[];
  from?: string;       // defaults to the agency inbox
  bookingRef?: string;  // for threading/tracking via custom header
}

export interface EmailResult {
  messageId: string;
  threadId?: string;
  sentAt: string;
}

// ============================================================
// Helpers
// ============================================================

/**
 * URL-safe base64 (RFC 4648 §5) — Gmail requires this format for raw messages.
 */
function base64url(s: string): string {
  return Buffer.from(s, 'utf-8')
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
}

/**
 * Build an RFC-5322 / RFC-2822 message ready for Gmail's `raw` field.
 * Handles plain text, HTML, and multipart with attachments.
 */
function buildRfc5322Message(input: EmailInput): string {
  const boundary = `=_atelier_${Date.now().toString(36)}`;
  const lines: string[] = [];
  const bodyType = input.bodyType ?? 'html';

  if (input.from) lines.push(`From: ${input.from}`);
  lines.push(`To: ${input.to.join(', ')}`);
  if (input.cc?.length) lines.push(`Cc: ${input.cc.join(', ')}`);
  if (input.bcc?.length) lines.push(`Bcc: ${input.bcc.join(', ')}`);
  lines.push(`Subject: ${input.subject}`);
  lines.push('MIME-Version: 1.0');
  if (input.bookingRef) {
    lines.push(`X-Atelier-Booking-Ref: ${input.bookingRef}`);
  }

  const hasAttachments = (input.attachments?.length ?? 0) > 0;

  if (!hasAttachments) {
    // Single-part message
    lines.push(
      `Content-Type: ${bodyType === 'html' ? 'text/html' : 'text/plain'}; charset="UTF-8"`,
    );
    lines.push('Content-Transfer-Encoding: 8bit');
    lines.push('');
    lines.push(input.body);
    return lines.join('\r\n');
  }

  // Multipart: body + attachments
  lines.push(`Content-Type: multipart/mixed; boundary="${boundary}"`);
  lines.push('');
  lines.push(`--${boundary}`);
  lines.push(`Content-Type: ${bodyType === 'html' ? 'text/html' : 'text/plain'}; charset="UTF-8"`);
  lines.push('Content-Transfer-Encoding: 8bit');
  lines.push('');
  lines.push(input.body);

  for (const att of input.attachments!) {
    lines.push(`--${boundary}`);
    lines.push(`Content-Type: ${att.contentType}; name="${att.name}"`);
    lines.push('Content-Transfer-Encoding: base64');
    lines.push(`Content-Disposition: attachment; filename="${att.name}"`);
    lines.push('');
    // Wrap base64 to 76-char lines per RFC 2045
    lines.push(att.contentBase64.replace(/(.{76})/g, '$1\r\n'));
  }
  lines.push(`--${boundary}--`);
  return lines.join('\r\n');
}

// ============================================================
// Public API
// ============================================================

export async function sendEmail(input: EmailInput): Promise<EmailResult> {
  if (!isGoogleConfigured()) {
    throw new Error('Google not connected — connect Google in Settings to enable email sending.');
  }

  const raw = base64url(buildRfc5322Message(input));
  const token = await getAccessToken();

  const response = await fetch(SEND_URL, {
    method: 'POST',
    headers: {
      authorization: `Bearer ${token}`,
      'content-type': 'application/json',
    },
    body: JSON.stringify({ raw }),
  });

  if (!response.ok) {
    const errText = await response.text().catch(() => 'unknown');
    console.error('[gmail] sendEmail failed', response.status, errText);
    throw new Error(`Gmail sendEmail failed: ${response.status} ${errText.slice(0, 200)}`);
  }

  const data = await response.json() as { id: string; threadId: string };
  return {
    messageId: data.id,
    threadId: data.threadId,
    sentAt: new Date().toISOString(),
  };
}

export async function draftEmail(input: EmailInput): Promise<{ draftId: string }> {
  if (!isGoogleConfigured()) {
    throw new Error('Google not connected — connect Google in Settings to enable email drafts.');
  }

  const raw = base64url(buildRfc5322Message(input));
  const token = await getAccessToken();

  const response = await fetch(DRAFTS_URL, {
    method: 'POST',
    headers: {
      authorization: `Bearer ${token}`,
      'content-type': 'application/json',
    },
    body: JSON.stringify({ message: { raw } }),
  });

  if (!response.ok) {
    const errText = await response.text().catch(() => 'unknown');
    console.error('[gmail] draftEmail failed', response.status, errText);
    throw new Error(`Gmail draftEmail failed: ${response.status} ${errText.slice(0, 200)}`);
  }

  const data = await response.json() as { id: string };
  return { draftId: data.id };
}

export async function sendDraft(draftId: string): Promise<EmailResult> {
  if (!isGoogleConfigured()) {
    throw new Error('Google not connected — connect Google in Settings to enable email sending.');
  }

  const token = await getAccessToken();

  const response = await fetch(`${DRAFTS_URL}/send`, {
    method: 'POST',
    headers: {
      authorization: `Bearer ${token}`,
      'content-type': 'application/json',
    },
    body: JSON.stringify({ id: draftId }),
  });

  if (!response.ok) {
    const errText = await response.text().catch(() => 'unknown');
    console.error('[gmail] sendDraft failed', response.status, errText);
    throw new Error(`Gmail sendDraft failed: ${response.status} ${errText.slice(0, 200)}`);
  }

  const data = await response.json() as { id: string; threadId: string };
  return {
    messageId: data.id,
    threadId: data.threadId,
    sentAt: new Date().toISOString(),
  };
}

/**
 * Fetch the plain-text body of a Gmail message. Used by the brief
 * auto-detect flow to populate brief_raw_text when converting an
 * email to a booking. Walks the MIME tree to find a text/plain part;
 * falls back to a best-effort decode of text/html if that's all there
 * is. Returns empty string on any failure (caller decides what to do).
 */
export async function getMessageBody(messageId: string): Promise<string> {
  if (!isGoogleConfigured()) return '';
  try {
    const token = await getAccessToken();
    const url = `https://gmail.googleapis.com/gmail/v1/users/${GMAIL_USER}/messages/${messageId}?format=full`;
    const res = await fetch(url, { headers: { authorization: `Bearer ${token}` } });
    if (!res.ok) return '';
    const data = await res.json() as {
      payload?: {
        mimeType?: string;
        body?: { data?: string };
        parts?: Array<{ mimeType?: string; body?: { data?: string }; parts?: unknown[] }>;
      };
    };
    return walkForBody(data.payload);
  } catch {
    return '';
  }
}

function walkForBody(part: unknown): string {
  if (!part || typeof part !== 'object') return '';
  const p = part as { mimeType?: string; body?: { data?: string }; parts?: unknown[] };
  // Prefer text/plain
  if (p.mimeType === 'text/plain' && p.body?.data) {
    return decodeBase64Url(p.body.data);
  }
  // Then walk children
  if (Array.isArray(p.parts)) {
    for (const child of p.parts) {
      const text = walkForBody(child);
      if (text) return text;
    }
  }
  // Fall back to text/html (strip tags very crudely)
  if (p.mimeType === 'text/html' && p.body?.data) {
    const html = decodeBase64Url(p.body.data);
    return html.replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
      .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '')
      .replace(/<[^>]+>/g, '')
      .replace(/&nbsp;/g, ' ')
      .replace(/&amp;/g, '&')
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/\n{3,}/g, '\n\n')
      .trim();
  }
  return '';
}

function decodeBase64Url(s: string): string {
  // Gmail uses base64url; convert to base64 then decode as UTF-8.
  const normalised = s.replace(/-/g, '+').replace(/_/g, '/');
  try {
    return Buffer.from(normalised, 'base64').toString('utf-8');
  } catch {
    return '';
  }
}

/**
 * Search inbox for emails matching a query (booking ref, sender, subject).
 * Uses Gmail's search syntax: `from:foo@bar.com subject:#3579`.
 *
 * Currently returns a small results array — pagination is a follow-up.
 */
export async function searchInbox(query: string, limit = 10): Promise<{
  id: string;
  subject: string;
  from: string;
  receivedAt: string;
  snippet: string;
}[]> {
  if (!isGoogleConfigured()) {
    console.log('[gmail] SEARCH INBOX (stub — no credentials)', query);
    return [];
  }

  // Hard 5s timeout so a slow Gmail call can't hang a page render.
  // Booking detail uses Suspense for streaming; this still bounds the worst case.
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 5_000);

  try {
    const token = await getAccessToken();
    const listUrl = `https://gmail.googleapis.com/gmail/v1/users/${GMAIL_USER}/messages?q=${encodeURIComponent(query)}&maxResults=${limit}`;

    const listResp = await fetch(listUrl, {
      headers: { authorization: `Bearer ${token}` },
      signal: controller.signal,
    });
    if (!listResp.ok) {
      console.error('[gmail] searchInbox list failed', listResp.status);
      return [];
    }
    const listData = await listResp.json() as { messages?: { id: string }[] };
    const ids = (listData.messages ?? []).slice(0, limit).map((m) => m.id);

    // Fetch each message in parallel for headers + snippet.
    const results = await Promise.all(ids.map(async (id) => {
      const msgUrl = `https://gmail.googleapis.com/gmail/v1/users/${GMAIL_USER}/messages/${id}?format=metadata&metadataHeaders=Subject&metadataHeaders=From&metadataHeaders=Date`;
      const r = await fetch(msgUrl, {
        headers: { authorization: `Bearer ${token}` },
        signal: controller.signal,
      });
      if (!r.ok) return null;
      const m = await r.json() as {
        id: string;
        snippet: string;
        payload: { headers: { name: string; value: string }[] };
        internalDate: string;
      };
      const headerOf = (n: string) =>
        m.payload.headers.find((h) => h.name.toLowerCase() === n.toLowerCase())?.value ?? '';
      return {
        id: m.id,
        subject: headerOf('Subject'),
        from: headerOf('From'),
        receivedAt: new Date(parseInt(m.internalDate, 10)).toISOString(),
        snippet: m.snippet ?? '',
      };
    }));

    return results.filter((r): r is NonNullable<typeof r> => r !== null);
  } catch (err) {
    if ((err as Error).name === 'AbortError') {
      console.warn('[gmail] searchInbox timed out after 5s', query);
    } else {
      console.error('[gmail] searchInbox error', err);
    }
    return [];
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Brief auto-detect (PR#52, Option B).
 *
 * Returns recent inbox messages that look like creative briefs — i.e.
 * candidates the producer might want to convert to a booking. We
 * deliberately err on the side of *more* candidates and let the human
 * filter — false positives are easy to dismiss; false negatives mean
 * lost work.
 *
 * Heuristic: subject or body contains production-related keywords, or the
 * sender is a known client contact, or the email mentions a known talent by
 * name. Received in the last 30 days, not sent by us. Excludes anything
 * already linked to an existing booking ref.
 *
 * Three signal layers:
 *   1. Subject keywords — structured brief/rfp/shoot emails
 *   2. Body phrases — informal production enquiries ("are you available", etc.)
 *   3. From known client emails — anything from a client, regardless of content
 *   4. Talent name mentions — emails asking about specific artists by name/nickname
 */
export async function findPotentialBriefs(opts: {
  /** Booking refs already in our DB — used to exclude already-converted emails. */
  existingRefs?: string[];
  /** Client email addresses — emails from these senders are always surfaced. */
  clientEmails?: string[];
  /** Talent working names + nicknames — emails mentioning these are surfaced. */
  talentNames?: string[];
  /** Gmail message IDs the user has marked "Not a brief" — filtered out server-side. */
  dismissedIds?: Set<string>;
  /** Already-converted bookings keyed by their source_gmail_message_id — filtered out server-side. */
  convertedSourceIds?: Set<string>;
  limit?: number;
} = {}): Promise<Array<{
  id: string;
  subject: string;
  from: string;
  receivedAt: string;
  snippet: string;
}>> {
  const limit = opts.limit ?? 20;

  // Layer 1: subject keywords — deliberately narrow to avoid automated noise.
  // "production" and "campaign" removed — too generic (match Vercel deploys,
  // marketing tools). "booking" removed — matches hotel/airline confirmations.
  const subjectTerms = [
    'subject:brief',
    'subject:rfp',
    'subject:rfq',
    'subject:"photo shoot"',
    'subject:"video shoot"',
    'subject:"creative brief"',
    'subject:"content shoot"',
    'subject:"talent brief"',
    'subject:"shoot brief"',
    'subject:"request for quote"',
    'subject:inquiry',
    'subject:enquiry',
    'subject:availability',
    'subject:photographer',
    'subject:videographer',
    'subject:commission',
  ];

  // Layer 2: body phrases — production-specific, low false-positive rate
  const bodyPhrases = [
    '"creative brief"',
    '"photo shoot"',
    '"video shoot"',
    '"photoshoot"',
    '"production brief"',
    '"talent brief"',
    '"shoot brief"',
    '"request for quote"',
    '"shoot dates"',
    '"shoot date"',
    '"are you available"',
    '"your availability"',
    '"available for the shoot"',
    '"available to shoot"',
    '"free for the shoot"',
    '"free for a shoot"',
    '"looking for a photographer"',
    '"looking for a videographer"',
    '"looking for a director"',
    '"content creation"',
    '"campaign shoot"',
  ];

  const queryParts: string[] = [
    `{${subjectTerms.join(' ')} ${bodyPhrases.join(' ')}}`,
  ];

  // Layer 3: known client emails — always surface emails from clients
  const clientEmails = (opts.clientEmails ?? []).filter(Boolean).slice(0, 50);
  if (clientEmails.length > 0) {
    queryParts.push(`{${clientEmails.map((e) => `from:${e}`).join(' ')}}`);
  }

  // Layer 4: talent name/nickname mentions in body or subject
  const talentNames = (opts.talentNames ?? []).filter(Boolean);
  if (talentNames.length > 0) {
    // Use quoted full names — specific enough to avoid noise
    const nameTerms = talentNames.map((n) => `"${n}"`);
    queryParts.push(`{${nameTerms.join(' ')}}`);
  }

  const combined = queryParts.length > 1
    ? `{${queryParts.join(' ')}}`
    : queryParts[0];

  // Blocklist — automated senders that generate false positives.
  // "production" in Vercel deploy emails and "campaign" in Klaviyo/Mailchimp
  // triggered matches; these exclusions prevent that class of noise.
  const blockedDomains = [
    'vercel.com', 'github.com', 'atlassian.com', 'slack.com',
    'notion.so', 'linear.app', 'figma.com', 'stripe.com',
    'amazonaws.com', 'heroku.com', 'netlify.com', 'railway.app',
  ];
  const domainExclusions = blockedDomains.map((d) => `-from:${d}`).join(' ');
  // Exclude common automated sender patterns regardless of domain.
  const senderExclusions = '-from:noreply -from:no-reply -from:donotreply -from:notifications -from:automated -from:mailer';

  // 30-day window — briefs sometimes land weeks before a producer follows up.
  const query = `${combined} newer_than:30d -in:sent -in:drafts -from:me ${domainExclusions} ${senderExclusions}`;

  const results = await searchInbox(query, limit * 2); // over-fetch then filter

  // Secondary pass: drop anything matching obvious automated-sender patterns
  // that the Gmail query might have missed (subdomain variations, etc.).
  const AUTOMATED_PATTERNS = [
    /noreply/i, /no-reply/i, /donotreply/i, /do-not-reply/i,
    /automated/i, /notifications?@/i, /alerts?@/i, /mailer@/i,
    /@vercel\.com$/i, /@github\.com$/i,
  ];
  const isAutomated = (from: string) => AUTOMATED_PATTERNS.some((p) => p.test(from));

  // Drop already-converted emails and automated senders.
  const refSet = new Set((opts.existingRefs ?? []).map((r) => r.toUpperCase()));
  const dismissedIds = opts.dismissedIds ?? new Set<string>();
  const convertedSourceIds = opts.convertedSourceIds ?? new Set<string>();
  const filtered = results.filter((r) => {
    if (dismissedIds.has(r.id)) return false;       // user marked "Not a brief"
    if (convertedSourceIds.has(r.id)) return false; // already converted to a booking
    if (isAutomated(r.from)) return false;
    const upper = r.subject.toUpperCase();
    for (const ref of refSet) {
      if (upper.includes(ref)) return false;
    }
    return true;
  });

  return filtered.slice(0, limit);
}
