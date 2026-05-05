import Topbar from '@/components/layout/Topbar';
import SettingsPanel from '@/components/settings/SettingsPanel';
import { getKillSwitchState } from '@/lib/utils/kill-switch';
import { getAgencyConfig } from '@/lib/utils/agency-config';
import { isGoogleConfigured } from '@/lib/integrations/google-auth';

export default async function SettingsPage() {
  const [ks, agency] = await Promise.all([
    getKillSwitchState(),
    Promise.resolve(getAgencyConfig()),
  ]);

  const integrations = {
    googleConnected: isGoogleConfigured(),
    xeroConnected: Boolean(process.env.XERO_CLIENT_ID && process.env.XERO_REFRESH_TOKEN),
    anthropicConnected: Boolean(process.env.ANTHROPIC_API_KEY),
  };

  return (
    <>
      <Topbar title="Settings" />
      <div className="p-4 sm:p-6">
        <SettingsPanel killSwitch={ks} agency={agency} integrations={integrations} />
      </div>
    </>
  );
}
