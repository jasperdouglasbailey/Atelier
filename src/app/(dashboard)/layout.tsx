import Sidebar from '@/components/layout/Sidebar';
import KillSwitchBanner from '@/components/layout/KillSwitchBanner';
import { getKillSwitchState } from '@/lib/utils/kill-switch';
import { getPendingCount } from '@/lib/data/approvals';

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const [initialState, inboxCount] = await Promise.all([
    getKillSwitchState(),
    getPendingCount(),
  ]);

  return (
    <div className="flex h-screen overflow-hidden" style={{ background: '#0f1117', color: '#e8eaed' }}>
      <Sidebar inboxCount={inboxCount} />
      <div className="flex flex-1 flex-col overflow-hidden">
        <KillSwitchBanner initialState={initialState} />
        <main className="flex-1 overflow-y-auto">{children}</main>
      </div>
    </div>
  );
}
