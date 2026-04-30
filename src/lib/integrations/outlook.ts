/**
 * Outlook / Microsoft Graph Integration Stub
 *
 * Handles: email relay (all comms route through the agency), calendar invites
 * for shoot days, brief ingestion from email.
 *
 * Doctrine: Client ↔ Artist never direct. All comms go through Saunders & Co.
 * Selects, retouch notes, feedback — everything relays via the agency.
 *
 * Setup: Register an Azure AD app with Mail.Send, Mail.Read, Calendars.ReadWrite
 * permissions. Store AZURE_CLIENT_ID, AZURE_CLIENT_SECRET, AZURE_TENANT_ID in env.
 */

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

/** Send an email via Microsoft Graph (agency inbox). */
export async function sendEmail(input: EmailInput): Promise<EmailResult> {
  console.log('[outlook] SEND EMAIL (stub)', {
    to: input.to,
    subject: input.subject,
    bookingRef: input.bookingRef,
  });

  // TODO: Use @microsoft/microsoft-graph-client
  // const client = await getGraphClient();
  // await client.api('/me/sendMail').post({
  //   message: { subject, body: { contentType: 'HTML', content: body }, toRecipients: [...] },
  //   saveToSentItems: true,
  // });

  return {
    messageId: `msg-stub-${Date.now()}`,
    sentAt: new Date().toISOString(),
  };
}

/** Draft an email (for approval mode — agent drafts, Jasper approves, then sends). */
export async function draftEmail(input: EmailInput): Promise<{ draftId: string }> {
  console.log('[outlook] DRAFT EMAIL (stub)', {
    to: input.to,
    subject: input.subject,
  });

  return { draftId: `draft-stub-${Date.now()}` };
}

/** Send a previously drafted email (after approval). */
export async function sendDraft(draftId: string): Promise<EmailResult> {
  console.log('[outlook] SEND DRAFT (stub)', draftId);

  return {
    messageId: `msg-from-draft-${draftId}`,
    sentAt: new Date().toISOString(),
  };
}

/** Create a calendar event (shoot day). */
export async function createCalendarEvent(input: {
  subject: string;
  start: string;       // ISO datetime
  end: string;
  location?: string;
  attendees?: string[];
  body?: string;
  bookingRef?: string;
}): Promise<{ eventId: string }> {
  console.log('[outlook] CREATE EVENT (stub)', input.subject, input.start);

  return { eventId: `event-stub-${Date.now()}` };
}

/** Search inbox for emails matching a booking reference. */
export async function searchInbox(query: string, limit = 10): Promise<{
  id: string;
  subject: string;
  from: string;
  receivedAt: string;
  snippet: string;
}[]> {
  console.log('[outlook] SEARCH INBOX (stub)', query);

  return [];
}
