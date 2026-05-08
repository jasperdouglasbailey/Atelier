/**
 * Magic-link onboarding page (no auth required).
 *
 * The owner generates a token on a talent/crew detail page; this URL
 * is emailed to that person. The token validates the request — anyone
 * with the link can edit those fields, so we only expose fields that
 * make sense for the entity to manage themselves.
 */

import { notFound } from 'next/navigation';
import { findByOnboardingToken } from '@/lib/data/onboarding';
import { PALETTE } from '@/lib/utils/constants';
import OnboardingMagicLinkForm from '@/components/onboarding/OnboardingMagicLinkForm';
import CollectionNotice from '@/components/onboarding/CollectionNotice';

export const metadata = {
  title: 'Saunders & Co — Update your details',
};

export const dynamic = 'force-dynamic';

export default async function OnboardTokenPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  const prefill = await findByOnboardingToken(token);

  if (!prefill) {
    return (
      <div className="min-h-screen" style={{ background: PALETTE.bg }}>
        <div className="mx-auto max-w-xl px-4 py-12">
          <div className="mb-8 text-center">
            <h1 className="text-xl font-bold" style={{ color: PALETTE.text }}>Saunders &amp; Co</h1>
          </div>
          <div className="rounded-lg border p-6 text-center" style={{ background: PALETTE.surface, borderColor: PALETTE.border }}>
            <h2 className="text-base font-semibold" style={{ color: PALETTE.text }}>Link expired or invalid</h2>
            <p className="mt-2 text-sm" style={{ color: PALETTE.muted }}>
              This onboarding link can&apos;t be used. Please contact Saunders &amp; Co to get a new one.
            </p>
            <p className="mt-3 text-xs">
              <a href="mailto:info@saundersandco.com.au" style={{ color: PALETTE.accent }}>info@saundersandco.com.au</a>
            </p>
          </div>
        </div>
      </div>
    );
  }

  // Soft type-narrow for notFound semantic completeness — never reached
  if (!prefill.id) notFound();

  return (
    <div className="min-h-screen" style={{ background: PALETTE.bg }}>
      <div className="mx-auto max-w-xl px-4 py-12">
        <div className="mb-8 text-center">
          <h1 className="text-xl font-bold" style={{ color: PALETTE.text }}>Saunders &amp; Co</h1>
          <p className="mt-1 text-sm" style={{ color: PALETTE.muted }}>
            Update your details
          </p>
        </div>
        <CollectionNotice />
        <OnboardingMagicLinkForm token={token} prefill={prefill} />
      </div>
    </div>
  );
}
