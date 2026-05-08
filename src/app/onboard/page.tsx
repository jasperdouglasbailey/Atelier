import OnboardingForm from '@/components/onboarding/OnboardingForm';
import CollectionNotice from '@/components/onboarding/CollectionNotice';
import { PALETTE } from '@/lib/utils/constants';

export const metadata = {
  title: 'Saunders & Co — Onboarding',
};

export default function OnboardPage() {
  return (
    <div className="min-h-screen" style={{ background: PALETTE.bg }}>
      <div className="mx-auto max-w-xl px-4 py-12">
        <div className="mb-8 text-center">
          <h1 className="text-xl font-bold" style={{ color: PALETTE.text }}>Saunders & Co</h1>
          <p className="mt-1 text-sm" style={{ color: PALETTE.muted }}>Artist & Crew Onboarding</p>
        </div>
        <CollectionNotice />
        <OnboardingForm />
      </div>
    </div>
  );
}
