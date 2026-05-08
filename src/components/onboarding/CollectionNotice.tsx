/**
 * APP 5 collection notice — shown at every point where the public can
 * submit personal information to us:
 *
 *   - Public onboarding form (/onboard)
 *   - Magic-link onboarding form (/onboard/[token])
 *   - Anywhere else we ask the public to fill in a form
 *
 * APP 5.2 lists ten matters that must be notified to or made aware of
 * the individual at or before the time of collection. This notice
 * covers them in a brief, scannable layer with a link to the full
 * privacy policy for the detailed version (the "layered approach"
 * recommended in APP 1.12).
 *
 * Pure presentational component — no state, no logic.
 */

import Link from 'next/link';
import { PALETTE } from '@/lib/utils/constants';
import { getAgencyConfig } from '@/lib/utils/agency-config';

export default function CollectionNotice() {
  const agency = getAgencyConfig();
  const agencyName = agency.name;
  const privacyEmail = `privacy@${(agency.email ?? 'saundersandco.com.au').split('@').pop()}`;

  return (
    <div
      className="rounded-md border p-3 text-[11px] mb-4"
      style={{
        background: `${PALETTE.muted}10`,
        borderColor: PALETTE.border,
        color: PALETTE.muted,
        lineHeight: 1.55,
      }}
    >
      <div className="font-semibold mb-1.5" style={{ color: PALETTE.text }}>
        Privacy notice
      </div>
      <p className="mb-1.5">
        {agencyName} is collecting the personal information you submit on
        this form to onboard you as a contractor and to enable us to book,
        pay, and contact you about engagements. Providing this information
        is voluntary, but if you don&apos;t we may not be able to engage you.
      </p>
      <p className="mb-1.5">
        We hold this information in our agency platform and disclose it
        only to the people who need it to run a shoot — typically clients
        for call sheets, our accounting system (Xero) for payment, and the
        Australian Taxation Office where required by tax law. The platform
        uses cloud services in India (Supabase) and the United States
        (Anthropic, Google, Vercel).
      </p>
      <p className="mb-0">
        You can request access to or correction of your data, withdraw
        consent, or complain at any time by emailing{' '}
        <a href={`mailto:${privacyEmail}`} style={{ color: PALETTE.accent }}>
          {privacyEmail}
        </a>
        . The full policy is at{' '}
        <Link href="/privacy" target="_blank" rel="noreferrer" style={{ color: PALETTE.accent }}>
          /privacy
        </Link>
        .
      </p>
    </div>
  );
}
