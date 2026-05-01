/**
 * Gmail Integration Stub
 *
 * Handles: email relay (all comms route through the agency), brief ingestion
 * from email, draft+send flow for approval mode.
 *
 * Doctrine: Client ↔ Artist never direct. All comms relay through Saunders & Co.
 *
 * Setup: create a Google Cloud project, enable the Gmail API, configure OAuth
 * consent (Internal if Workspace, External otherwise), add the scopes from
 * `google-auth.ts`, then run the auth flow at /api/auth/callback/google to
 * obtain GOOGLE_REFRESH_TOKEN.
 *
 * Real implementation will use:
 *   - Gmail REST API: https://gmail.googleapis.com/gmail/v1/users/me/messages
 *   - RFC-2822 / RFC-5322 message format, base64url encoded in `raw`
 *   - For drafts: /users/me/drafts (POST to create, POST /send to send)
 *
 * Stays raw-fetch (no SDK dependency) for consistency with anthropic.ts and
 * faster cold starts on serverless.
 */

import { isGoogleConfigured } from './google-auth';

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
  bookingRef?: string;  // for threading/tracking
}

export interface EmailResult {
  messageId: string;
  sentAt: string;
}

/** Send an email via Gmail (agency inbox). */
export async function sendEmail(input: EmailInput): Promise<EmailResult> {
  if (!isGoogleConfigured()) {
    console.log('[gmail] SEND EMAIL (stub — no credentials)', {
      to: input.to,
      subject: input.subject,
      bookingRef: input.bookingRef,
    });
    return { messageId: `msg-stub-${Date.now()}`, sentAt: new Date().toISOString() };
  }

  // TODO: Build RFC-5322 message, base64url-encode, POST to
  // https://gmail.googleapis.com/gmail/v1/users/me/messages/send
  // with bearer = await getAccessToken().
  console.log('[gmail] SEND EMAIL (not yet implemented)', input.subject);
  return { messageId: `msg-stub-${Date.now()}`, sentAt: new Date().toISOString() };
}

/** Draft an email (for approval mode — agent drafts, Jasper approves, then sends). */
export async function draftEmail(input: EmailInput): Promise<{ draftId: string }> {
  if (!isGoogleConfigured()) {
    console.log('[gmail] DRAFT EMAIL (stub — no credentials)', {
      to: input.to,
      subject: input.subject,
    });
    return { draftId: `draft-stub-${Date.now()}` };
  }

  // TODO: POST to https://gmail.googleapis.com/gmail/v1/users/me/drafts
  console.log('[gmail] DRAFT EMAIL (not yet implemented)', input.subject);
  return { draftId: `draft-stub-${Date.now()}` };
}

/** Send a previously drafted email (after approval). */
export async function sendDraft(draftId: string): Promise<EmailResult> {
  if (!isGoogleConfigured()) {
    console.log('[gmail] SEND DRAFT (stub — no credentials)', draftId);
    return { messageId: `msg-from-draft-${draftId}`, sentAt: new Date().toISOString() };
  }

  // TODO: POST to https://gmail.googleapis.com/gmail/v1/users/me/drafts/send
  console.log('[gmail] SEND DRAFT (not yet implemented)', draftId);
  return { messageId: `msg-from-draft-${draftId}`, sentAt: new Date().toISOString() };
}

/**
 * Search inbox for emails matching a query (booking ref, sender, subject).
 * Uses Gmail's search syntax: `from:foo@bar.com subject:#3579`.
 */
export async function searchInbox(query: string, _limit = 10): Promise<{
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

  // TODO: GET https://gmail.googleapis.com/gmail/v1/users/me/messages?q=...
  // then GET each message id for headers + snippet.
  console.log('[gmail] SEARCH INBOX (not yet implemented)', query);
  return [];
}
