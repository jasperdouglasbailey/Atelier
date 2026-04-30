import Topbar from '@/components/layout/Topbar';
import SettingsPanel from '@/components/settings/SettingsPanel';
import { getKillSwitchState } from '@/lib/utils/kill-switch';

export default async function SettingsPage() {
  const ks = await getKillSwitchState();

  return (
    <>
      <Topbar title="Settings" />
      <div className="p-4 sm:p-6">
        <SettingsPanel killSwitch={ks} />
      </div>
    </>
  );
}
