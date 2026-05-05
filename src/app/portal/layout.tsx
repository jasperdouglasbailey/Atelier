/**
 * Portal layout — for talent and crew users.
 *
 * Owner / partner users are redirected to the main dashboard. Talent
 * and crew see a stripped-back layout (no sidebar, no admin features).
 *
 * No RLS yet means we can't rely on the DB to keep them out of admin
 * data; the portal pages MUST scope every query by current_talent_id()
 * / current_crew_id() at the application layer.
 */

import { redirect } from 'next/navigation';
import Link from 'next/link';
import { getCurrentAppUser } from '@/lib/data/app-users';
import { signOutAction } from '@/app/actions/auth';
import { PALETTE } from '@/lib/utils/constants';
import { getAgencyConfig } from '@/lib/utils/agency-config';

export const dynamic = 'force-dynamic';

export default async function PortalLayout({ children }: { children: React.ReactNode }) {
  const user = await getCurrentAppUser();

  if (!user) {
    // Authed but not provisioned — bounce to login with a clearer error
    redirect('/login?error=not_authorised');
  }

  if (user.role === 'owner' || user.role === 'partner') {
    redirect('/');
  }

  const agency = getAgencyConfig();

  return (
    <div className="min-h-screen" style={{ background: PALETTE.bg, color: PALETTE.text }}>
      <header
        className="border-b px-4 sm:px-6 py-3 flex items-center justify-between"
        style={{ background: PALETTE.surface, borderColor: PALETTE.border }}
      >
        <div className="flex items-center gap-3">
          <Link href="/portal" className="text-sm font-semibold" style={{ color: PALETTE.text }}>
            {agency.name}
          </Link>
          <span className="text-[10px] uppercase tracking-wider" style={{ color: PALETTE.muted }}>
            {user.role === 'talent' ? 'Talent portal' : 'Crew portal'}
          </span>
        </div>
        <form action={signOutAction}>
          <button type="submit" className="text-xs underline" style={{ color: PALETTE.muted }}>
            Sign out
          </button>
        </form>
      </header>
      <main>{children}</main>
    </div>
  );
}
