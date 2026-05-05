import { redirect } from 'next/navigation';
import Sidebar from '@/components/layout/Sidebar';
import KillSwitchBanner from '@/components/layout/KillSwitchBanner';
import KeyboardShortcuts from '@/components/layout/KeyboardShortcuts';
import { getKillSwitchState } from '@/lib/utils/kill-switch';
import { getPendingCount } from '@/lib/data/approvals';
import { getCurrentAppUser } from '@/lib/data/app-users';
import { createClient } from '@/lib/supabase/server';

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  // Role-based routing: talent/crew users belong in their portal, not the
  // owner dashboard. Owner/partner (or unprovisioned/no-role users for
  // backwards compatibility) stay here.
  const appUser = await getCurrentAppUser();
  if (appUser?.role === 'talent') redirect('/portal/talent');
  if (appUser?.role === 'crew')   redirect('/portal/crew');

  const [initialState, inboxCount, userEmail] = await Promise.all([
    getKillSwitchState(),
    getPendingCount(),
    getCurrentUserEmail(),
  ]);

  return (
    <div className="flex h-screen overflow-hidden" style={{ background: 'var(--p-bg)', color: 'var(--p-text)' }}>
      <Sidebar inboxCount={inboxCount} userEmail={userEmail} />
      <div className="flex flex-1 flex-col overflow-hidden">
        <KillSwitchBanner initialState={initialState} />
        <main className="flex-1 overflow-y-auto">{children}</main>
      </div>
      <KeyboardShortcuts />
    </div>
  );
}

async function getCurrentUserEmail(): Promise<string | null> {
  if (!process.env.NEXT_PUBLIC_SUPABASE_URL) return null;
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    return user?.email ?? null;
  } catch {
    return null;
  }
}
