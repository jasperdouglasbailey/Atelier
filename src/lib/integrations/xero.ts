/**
 * Xero Integration Stub
 *
 * Handles: invoice creation, contact sync, payment tracking.
 * Banking details live exclusively in Xero — never stored in Atelier.
 *
 * Setup: Jasper needs to create an OAuth2 app in Xero developer portal,
 * then store XERO_CLIENT_ID, XERO_CLIENT_SECRET, XERO_TENANT_ID in env.
 */

export interface XeroInvoiceInput {
  bookingRef: string;
  clientName: string;
  clientEmail: string;
  lineItems: {
    description: string;
    quantity: number;
    unitAmount: number;
    taxType: 'OUTPUT' | 'EXEMPTOUTPUT'; // OUTPUT = 10% GST, EXEMPT = super
  }[];
  dueDate: string; // ISO date
  currency: string;
  reference?: string;
}

export interface XeroInvoiceResult {
  invoiceId: string;
  invoiceNumber: string;
  status: string;
  total: number;
}

export interface XeroContactInput {
  name: string;
  email: string;
  abn?: string;
  phone?: string;
}

/** Create a draft invoice in Xero. Currently logs and returns a stub. */
export async function createXeroInvoice(input: XeroInvoiceInput): Promise<XeroInvoiceResult> {
  console.log('[xero] CREATE INVOICE (stub)', JSON.stringify(input, null, 2));

  // TODO: Replace with actual Xero API call via xero-node SDK
  // const xero = await getXeroClient();
  // const invoice = await xero.accountingApi.createInvoices(tenantId, { invoices: [{ ... }] });

  return {
    invoiceId: `stub-${Date.now()}`,
    invoiceNumber: `INV-STUB-${input.bookingRef}`,
    status: 'DRAFT',
    total: input.lineItems.reduce((sum, l) => sum + l.quantity * l.unitAmount, 0),
  };
}

/** Sync a contact to Xero. Returns the Xero contact ID. */
export async function syncXeroContact(input: XeroContactInput): Promise<string> {
  console.log('[xero] SYNC CONTACT (stub)', input.name, input.email);

  // TODO: Upsert contact via Xero API
  return `xero-contact-stub-${Date.now()}`;
}

/** Check if a Xero invoice has been paid. */
export async function checkInvoicePayment(invoiceId: string): Promise<{
  paid: boolean;
  amountPaid: number;
  amountDue: number;
}> {
  console.log('[xero] CHECK PAYMENT (stub)', invoiceId);

  return { paid: false, amountPaid: 0, amountDue: 0 };
}

/** Create an artist/crew payment (bill) once client payment clears (pay-on-paid). */
export async function createXeroBill(input: {
  contactId: string;
  description: string;
  amount: number;
  bookingRef: string;
}): Promise<string> {
  console.log('[xero] CREATE BILL (stub)', input.description, input.amount);

  return `xero-bill-stub-${Date.now()}`;
}
