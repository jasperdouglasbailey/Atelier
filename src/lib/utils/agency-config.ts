/**
 * Agency configuration — read from environment variables.
 *
 * Set these in your .env.local (or Vercel environment settings):
 *
 *   NEXT_PUBLIC_AGENCY_NAME="Saunders & Co"
 *   NEXT_PUBLIC_AGENCY_ABN="XX XXX XXX XXX"
 *   NEXT_PUBLIC_AGENCY_ADDRESS="Level X, XX Street, Sydney NSW XXXX"
 *   NEXT_PUBLIC_AGENCY_EMAIL="jasper@saundersandco.com"
 *   NEXT_PUBLIC_AGENCY_PHONE="+61 X XXXX XXXX"
 *   NEXT_PUBLIC_AGENCY_WEBSITE="saundersandco.com"
 *   NEXT_PUBLIC_QUOTE_VALIDITY_DAYS="30"
 *   NEXT_PUBLIC_DEFAULT_PAYMENT_TERMS_DAYS="30"
 */

export type AgencyConfig = {
  name: string;
  abn: string | null;
  address: string | null;
  email: string | null;
  phone: string | null;
  website: string | null;
  quoteValidityDays: number;
  defaultPaymentTermsDays: number;
};

export function getAgencyConfig(): AgencyConfig {
  return {
    name: process.env.NEXT_PUBLIC_AGENCY_NAME ?? 'Saunders & Co',
    abn: process.env.NEXT_PUBLIC_AGENCY_ABN ?? null,
    address: process.env.NEXT_PUBLIC_AGENCY_ADDRESS ?? 'Sydney, NSW',
    email: process.env.NEXT_PUBLIC_AGENCY_EMAIL ?? null,
    phone: process.env.NEXT_PUBLIC_AGENCY_PHONE ?? null,
    website: process.env.NEXT_PUBLIC_AGENCY_WEBSITE ?? null,
    quoteValidityDays: parseInt(process.env.NEXT_PUBLIC_QUOTE_VALIDITY_DAYS ?? '30', 10),
    defaultPaymentTermsDays: parseInt(process.env.NEXT_PUBLIC_DEFAULT_PAYMENT_TERMS_DAYS ?? '30', 10),
  };
}
