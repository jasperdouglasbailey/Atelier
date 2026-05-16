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

// Audit-row action names for `_run` events, one per Vercel cron schedule.
// Mapped 1:1 to entries in vercel.json. Adding a new cron route? Add the
// underscored name here AND make sure the route emits cron_<name>_run.
const CRON_NAMES = [
  'lock_ot_windows',
  'scheduled_comms',     // unified reminder cron — see reminder-rules.ts
  'tomorrow_digest',
  'data_retention',
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

  // Sanitised presence flag only — never leak the secret value to the client.
  const cronSecretPresent = Boolean(process.env.CRON_SECRET);

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
          cronSecretPresent={cronSecretPresent}
        />
      </div>
    </>
  );
}
