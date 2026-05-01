import Sidebar from '@/components/layout/Sidebar';
import KillSwitchBanner from '@/components/layout/KillSwitchBanner';
import { getKillSwitchState } from '@/lib/utils/kill-switch';
import { getPendingCount } from '@/lib/data/approvals';
import { createClient } from '@/lib/supabase/server';

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const [initialState, inboxCount, userEmail] = await Promise.all([
    getKillSwitchState(),
    getPendingCount(),
    getCurrentUserEmail(),
  ]);

  return (
    <div className="flex h-screen overflow-hidden" style={{ background: '#0a0a0a', color: '#ededed' }}>
      <Sidebar inboxCount={inboxCount} userEmail={userEmail} />
      <div className="flex flex-1 flex-col overflow-hidden">
        <KillSwitchBanner initialState={initialState} />
        <main className="flex-1 overflow-y-auto">{children}</main>
      </div>
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
