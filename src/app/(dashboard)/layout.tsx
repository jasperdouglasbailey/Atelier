import Sidebar from '@/components/layout/Sidebar';
import KillSwitchBanner from '@/components/layout/KillSwitchBanner';

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex h-screen overflow-hidden" style={{ background: '#0f1117', color: '#e8eaed' }}>
      <Sidebar />
      <div className="flex flex-1 flex-col overflow-hidden">
        <KillSwitchBanner />
        <main className="flex-1 overflow-y-auto">{children}</main>
      </div>
    </div>
  );
}
