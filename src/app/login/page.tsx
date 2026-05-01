import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { PALETTE } from '@/lib/utils/constants';
import { getAgencyConfig } from '@/lib/utils/agency-config';
import LoginForm from './LoginForm';

type Props = { searchParams: Promise<{ error?: string }> };

const ERROR_MESSAGES: Record<string, string> = {
  invalid_link: 'That sign-in link is malformed. Please request a new one.',
  link_expired: 'That sign-in link has expired or already been used. Please request a new one.',
  not_authorised: 'That email address is not authorised to access this app.',
};

export default async function LoginPage({ searchParams }: Props) {
  // If already signed in, bounce to the dashboard.
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (user) redirect('/');

  const params = await searchParams;
  const errorMsg = params.error ? ERROR_MESSAGES[params.error] : null;

  const agency = getAgencyConfig();

  return (
    <div
      className="min-h-screen flex items-center justify-center p-6"
      style={{ background: PALETTE.bg, color: PALETTE.text }}
    >
      <div
        className="w-full max-w-sm rounded-lg border p-6 space-y-5"
        style={{ background: PALETTE.surface, borderColor: PALETTE.border }}
      >
        <div>
          <div className="text-xs uppercase tracking-wider font-semibold" style={{ color: PALETTE.muted }}>
            {agency.name}
          </div>
          <h1 className="text-lg font-semibold mt-1" style={{ color: PALETTE.text }}>
            Sign in to Atelier
          </h1>
        </div>

        {errorMsg && (
          <div
            className="rounded px-3 py-2 text-xs"
            style={{ color: PALETTE.danger, background: `${PALETTE.danger}15` }}
          >
            {errorMsg}
          </div>
        )}

        <LoginForm />
      </div>
    </div>
  );
}
