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

/**
 * Stub fallback when Google isn't configured. Keeps callers' code paths
 * working in dev without crashing or sending real mail.
 */
function stubReturn(action: string, input: EmailInput | { draftId: string }): EmailResult {
  console.log(`[gmail] ${action} (stub — no credentials)`,
    'subject' in input ? { to: input.to, subject: input.subject } : input,
  );
  return { messageId: `msg-stub-${Date.now()}`, sentAt: new Date().toISOString() };
}

// ============================================================
// Public API
// ============================================================

export async function sendEmail(input: EmailInput): Promise<EmailResult> {
  if (!isGoogleConfigured()) return stubReturn('SEND EMAIL', input);

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
    console.log('[gmail] DRAFT EMAIL (stub — no credentials)', { to: input.to, subject: input.subject });
    return { draftId: `draft-stub-${Date.now()}` };
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
  if (!isGoogleConfigured()) return stubReturn('SEND DRAFT', { draftId });

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
