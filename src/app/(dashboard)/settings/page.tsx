import Topbar from '@/components/layout/Topbar';
import SettingsPanel from '@/components/settings/SettingsPanel';
import { getKillSwitchState } from '@/lib/utils/kill-switch';
import { getAgencyConfig } from '@/lib/utils/agency-config';

export default async function SettingsPage() {
  const [ks, agency] = await Promise.all([
    getKillSwitchState(),
    Promise.resolve(getAgencyConfig()),
  ]);

  return (
    <>
      <Topbar title="Settings" />
      <div className="p-4 sm:p-6">
        <SettingsPanel killSwitch={ks} agency={agency} />
      </div>
    </>
  );
}
