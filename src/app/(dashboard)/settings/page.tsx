import Topbar from '@/components/layout/Topbar';
import SettingsPanel from '@/components/settings/SettingsPanel';
import { getKillSwitchState } from '@/lib/utils/kill-switch';
import { getAgencyConfig } from '@/lib/utils/agency-config';
import { checkGoogleTokenValid, getGrantedScopes } from '@/lib/integrations/google-auth';
import { createServiceClient } from '@/lib/supabase/service';

const EMAIL_FAILED_ACTIONS = [
  'send_quote_email_failed',
  'draft_quote_email_failed',
  'client_quote_chase_email_send_failed',
  'send_onboarding_link_failed',
  'client_brief_clarify_email_send_failed',
];

const CRON_NAMES = [
  'quote_chase',
  'compliance_pings',
  'data_retention',
  'lock_ot_windows',
  'post_shoot_chase',
  'talent_gallery_ping',
  'tomorrow_digest',
  'auto_anonymise',
] as const;

export type CronHealthEntry = { name: string; last_run: string | null };

export default async function SettingsPage() {
  const supabase = createServiceClient();
  // eslint-disable-next-line react-hooks/purity
  const sevenDaysAgo = new Date(Date.now() - 7 * 86400_000).toISOString();

  const [ks, agency, googleStatus, googleScopes, emailFailuresResult, cronRunsResult] = await Promise.all([
    getKillSwitchState(),
    Promise.resolve(getAgencyConfig()),
    checkGoogleTokenValid(),
    getGrantedScopes(),
    supabase
      .from('atelier_audit_log')
      .select('action, created_at')
      .in('action', EMAIL_FAILED_ACTIONS)
      .gte('created_at', sevenDaysAgo)
      .order('created_at', { ascending: false })
      .limit(5),
    supabase
      .from('atelier_audit_log')
      .select('action, created_at')
      .like('action', 'cron_%_run')
      .order('created_at', { ascending: false })
      .limit(50),
  ]);

  const emailFailures = emailFailuresResult.data ?? [];

  const cronHealth: CronHealthEntry[] = CRON_NAMES.map((name) => {
    const latest = (cronRunsResult.data ?? []).find((r) => r.action === `cron_${name}_run`);
    return { name, last_run: latest?.created_at ?? null };
  });

  const integrations = {
    googleStatus,
    googleScopes,
    xeroConnected: Boolean(process.env.XERO_CLIENT_ID && process.env.XERO_REFRESH_TOKEN),
    anthropicConnected: Boolean(process.env.ANTHROPIC_API_KEY),
  };

  return (
    <>
      <Topbar title="Settings" />
      <div className="p-4 sm:p-6">
        <SettingsPanel
          killSwitch={ks}
          agency={agency}
          integrations={integrations}
          emailFailures={emailFailures}
          cronHealth={cronHealth}
        />
      </div>
    </>
  );
}
