'use client';

import { useEffect, useOptimistic, useState, useTransition } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { usePushNotifications } from '@/lib/hooks/usePushNotifications';
import type { KillSwitchState } from '@/lib/types/database';
import { toggleKillSwitchAction } from '@/app/actions/kill-switch';
import { PALETTE, DEFAULT_COMMISSION_RATE, DEFAULT_ASF_RATE, GST_RATE, SUPER_RATE_CHARGED, SUPER_RATE_PAID } from '@/lib/utils/constants';
import type { AgencyConfig } from '@/lib/utils/agency-config';
import KpiCard, { KpiStrip } from '@/components/ui/KpiCard';
import SectionCard from '@/components/ui/SectionCard';

type GoogleStatus = 'connected' | 'invalid_token' | 'not_configured';
type IntegrationStatus = { googleStatus: GoogleStatus; googleScopes?: string[]; xeroConnected: boolean; anthropicConnected: boolean };
type EmailFailure = { action: string; created_at: string };
type CronHealthEntry = { name: string; last_run: string | null };
type Props = {
  killSwitch: KillSwitchState | null;
  agency: AgencyConfig;
  integrations?: IntegrationStatus;
  emailFailures?: EmailFailure[];
  cronHealth?: CronHealthEntry[];
  cronSecretPresent?: boolean;
};

function Toggle({ label, description, checked, onChange, color }: {
  label: string;
  description: string;
  checked: boolean;
  onChange: () => void;
  color: string;
}) {
  return (
    <div className="flex items-center justify-between gap-3">
      <div className="min-w-0">
        <div className="text-xs font-medium" style={{ color: PALETTE.text }}>{label}</div>
        <div className="text-[10px] mt-0.5" style={{ color: PALETTE.muted }}>{description}</div>
      </div>
      <button
        onClick={onChange}
        className="relative h-5 w-9 flex-none rounded-full transition-colors"
        style={{ background: checked ? color : PALETTE.border }}
        aria-pressed={checked}
      >
        <span
          className="absolute top-0.5 left-0.5 h-4 w-4 rounded-full bg-white transition-transform"
          style={{ transform: checked ? 'translateX(16px)' : 'translateX(0)' }}
        />
      </button>
    </div>
  );
}

export default function SettingsPanel({ killSwitch, agency, integrations, emailFailures = [], cronHealth = [], cronSecretPresent = false }: Props) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  // Optimistic state — flips immediately, auto-syncs to server prop after refresh.
  const [isActive, setOptimisticActive] = useOptimistic(killSwitch?.is_active ?? false);
  const [isPaused, setOptimisticPaused] = useOptimistic(killSwitch?.pause_outbound ?? false);

  function handleToggle(field: 'is_active' | 'pause_outbound') {
    if (isPending) return;
    startTransition(async () => {
      if (field === 'is_active') setOptimisticActive(!isActive);
      else setOptimisticPaused(!isPaused);
      await toggleKillSwitchAction(field);
      router.refresh();
    });
  }

  // Kill switch level for the KPI tile
  let level = 'Green';
  let levelColor: string = PALETTE.success;
  let levelTone: 'success' | 'warn' | 'danger' = 'success';
  if (isActive) {
    level = 'Red — Full Freeze';
    levelColor = PALETTE.danger;
    levelTone = 'danger';
  } else if (isPaused) {
    level = 'Amber — Paused';
    levelColor = PALETTE.warning;
    levelTone = 'warn';
  }

  // Cron health summary for the KPI tile — count crons that ran in the last 24h
  // eslint-disable-next-line react-hooks/purity
  const _now = Date.now();
  const cronHealthy = cronHealth.filter((c) => c.last_run && (_now - new Date(c.last_run).getTime()) < 24 * 3600_000).length;
  const cronTotal = cronHealth.length;

  return (
    <div className="space-y-4">

      {/* KPI strip — at-a-glance system health */}
      <KpiStrip>
        <KpiCard
          label="Kill switch"
          value={<span style={{ color: levelColor }}>{level}</span>}
          sub={isActive ? 'agents fully paused' : isPaused ? 'drafts only, no send' : 'all systems operational'}
          tone={levelTone}
        />
        <KpiCard
          label="Google integration"
          value={
            integrations?.googleStatus === 'connected' ? 'Connected'
            : integrations?.googleStatus === 'invalid_token' ? 'Reconnect'
            : 'Not configured'
          }
          sub={integrations?.googleStatus === 'connected' ? `${integrations.googleScopes?.length ?? 0} scopes granted` : 'Gmail · Drive · Calendar'}
          tone={integrations?.googleStatus === 'connected' ? 'success' : integrations?.googleStatus === 'invalid_token' ? 'danger' : 'warn'}
          valueColor={
            integrations?.googleStatus === 'connected' ? PALETTE.success
            : integrations?.googleStatus === 'invalid_token' ? PALETTE.danger
            : PALETTE.warning
          }
        />
        <KpiCard
          label="Scheduled jobs"
          value={cronTotal > 0 ? `${cronHealthy}/${cronTotal}` : '—'}
          sub={cronTotal === 0 ? 'no crons configured' : cronHealthy === cronTotal ? 'all ran in last 24h' : `${cronTotal - cronHealthy} stale`}
          tone={cronTotal > 0 && cronHealthy === cronTotal ? 'success' : cronTotal > 0 && cronHealthy < cronTotal ? 'warn' : 'default'}
          valueColor={cronTotal > 0 && cronHealthy === cronTotal ? PALETTE.success : cronTotal > 0 && cronHealthy < cronTotal ? PALETTE.warning : undefined}
        />
        <KpiCard
          label="Email failures"
          value={emailFailures.length}
          sub={emailFailures.length === 0 ? 'last 7 days clean' : 'last 7 days · click below'}
          tone={emailFailures.length > 0 ? 'warn' : 'success'}
          valueColor={emailFailures.length > 0 ? PALETTE.warning : PALETTE.success}
        />
      </KpiStrip>

      {/* Row 1: 3-col — admin + kill switch + push */}
      <div className="grid gap-4 lg:grid-cols-3">
        <SectionCard title="Admin">
          <Link
            href="/settings/partners"
            className="text-xs underline"
            style={{ color: PALETTE.accent }}
          >
            Partner & user roles →
          </Link>
          <p className="text-[10px] mt-1" style={{ color: PALETTE.muted }}>
            Provision partner (Jemma, Gary), talent and crew accounts.
          </p>
        </SectionCard>

        <SectionCard title="Kill switch">
          <div className="space-y-2.5">
            <Toggle
              label="Full Freeze (Red)"
              description="Halt all agent processing immediately"
              checked={isActive}
              onChange={() => handleToggle('is_active')}
              color={PALETTE.danger}
            />
            <Toggle
              label="Pause Outbound (Amber)"
              description="Agents draft but don't send — review first"
              checked={isPaused}
              onChange={() => handleToggle('pause_outbound')}
              color={PALETTE.warning}
            />
          </div>
          {killSwitch?.updated_at && (
            <LastUpdatedLine
              updatedAt={killSwitch.updated_at}
              updatedBy={killSwitch.updated_by ?? null}
            />
          )}
        </SectionCard>

        <PushNotificationsSection />
      </div>

      {/* Row 2: 2-col — agency profile + fee defaults */}
      <div className="grid gap-4 lg:grid-cols-2">
        <SectionCard title="Agency profile">
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
            <InfoField label="Name"           value={agency.name} />
            <InfoField label="ABN"            value={agency.abn ?? '—'} />
            <InfoField label="Address"        value={agency.address ?? '—'} />
            <InfoField label="Email"          value={agency.email ?? '—'} />
            <InfoField label="Phone"          value={agency.phone ?? '—'} />
            <InfoField label="Quote validity" value={`${agency.quoteValidityDays}d`} />
            <InfoField label="Payment terms"  value={`${agency.defaultPaymentTermsDays}d`} />
          </div>
          <p className="mt-2 text-[10px]" style={{ color: PALETTE.muted }}>
            Set via NEXT_PUBLIC_AGENCY_* env vars. Used on every quote + invoice.
          </p>
        </SectionCard>

        <SectionCard title="Fee engine defaults">
          <div className="grid grid-cols-3 gap-3 sm:grid-cols-5">
            <InfoField label="Commission"      value={`${(DEFAULT_COMMISSION_RATE * 100).toFixed(0)}%`} />
            <InfoField label="ASF"             value={`${(DEFAULT_ASF_RATE * 100).toFixed(0)}%`} />
            <InfoField label="GST"             value={`${(GST_RATE * 100).toFixed(0)}%`} />
            <InfoField label="Super charged"   value={`${(SUPER_RATE_CHARGED * 100).toFixed(0)}%`} />
            <InfoField label="Super paid"      value={`${(SUPER_RATE_PAID * 100).toFixed(0)}%`} />
          </div>
          <p className="mt-2 text-[10px]" style={{ color: PALETTE.muted }}>
            System-wide defaults. ASF adjustable per fee line. Commission on artist labour only. Super on crew labour only.
          </p>
        </SectionCard>
      </div>

      {/* Integrations — full width */}
      <SectionCard title="Integrations">
        <div className="space-y-2">
          <IntegrationRow name="Supabase" status="connected" detail="ap-southeast-2 (Sydney)" />
          <IntegrationRow
            name="Google (Gmail · Drive · Calendar)"
            status={
              integrations?.googleStatus === 'connected' ? 'connected'
              : integrations?.googleStatus === 'invalid_token' ? 'error'
              : 'pending'
            }
            detail={
              integrations?.googleStatus === 'connected'
                ? 'Token valid — scope breakdown below'
              : integrations?.googleStatus === 'invalid_token'
                ? 'Token expired or revoked — reconnect to restore email drafts and Drive'
              : 'Email relay, file delivery, shoot day events — single OAuth grant'
            }
            action={{ label: integrations?.googleStatus === 'not_configured' ? 'Connect Google' : 'Reconnect Google', href: '/api/auth/start/google' }}
          />
          {integrations?.googleStatus === 'connected' && (
            <div className="ml-4 grid grid-cols-2 gap-x-4 gap-y-1 rounded border px-3 py-2 text-[11px] sm:grid-cols-3" style={{ borderColor: PALETTE.border }}>
              {[
                { label: 'Inbox search (briefs)', scope: 'https://www.googleapis.com/auth/gmail.readonly' },
                { label: 'Gmail drafts',         scope: 'https://www.googleapis.com/auth/gmail.modify' },
                { label: 'Send email',           scope: 'https://www.googleapis.com/auth/gmail.send' },
                { label: 'Drive folders',        scope: 'https://www.googleapis.com/auth/drive.file' },
                { label: 'Calendar events',      scope: 'https://www.googleapis.com/auth/calendar.events' },
              ].map(({ label, scope }) => {
                const granted = integrations.googleScopes?.includes(scope);
                return (
                  <div key={scope} className="flex items-center gap-1.5">
                    <span style={{ color: granted ? PALETTE.success : PALETTE.danger }}>{granted ? '✓' : '✗'}</span>
                    <span style={{ color: granted ? PALETTE.text : PALETTE.muted }}>{label}</span>
                  </div>
                );
              })}
            </div>
          )}
          {emailFailures.length > 0 && (
            <div className="rounded border px-3 py-2.5" style={{ borderColor: PALETTE.warning, background: `${PALETTE.warning}10` }}>
              <div className="text-xs font-medium" style={{ color: PALETTE.warning }}>
                {emailFailures.length} email operation{emailFailures.length !== 1 ? 's' : ''} failed in the last 7 days
              </div>
              <div className="mt-1 flex flex-wrap gap-x-2 gap-y-1 text-[10px]">
                {[...new Set(emailFailures.map((f) => f.action))].map((action) => (
                  <Link
                    key={action}
                    href={`/audit?action=${encodeURIComponent(action)}`}
                    className="underline underline-offset-2"
                    style={{ color: PALETTE.accent }}
                  >
                    {action}
                  </Link>
                ))}
              </div>
              <div className="mt-1 text-[10px]" style={{ color: PALETTE.muted }}>
                Click an action to see the captured error in the audit log.
              </div>
            </div>
          )}
          <IntegrationRow
            name="Xero"
            status={integrations?.xeroConnected ? 'connected' : 'pending'}
            detail={integrations?.xeroConnected
              ? 'Connected — invoice sync active'
              : 'Invoice sync — needs OAuth credentials (XERO_CLIENT_ID + XERO_CLIENT_SECRET)'}
          />
          <IntegrationRow
            name="Anthropic API"
            status={integrations?.anthropicConnected ? 'connected' : 'pending'}
            detail={integrations?.anthropicConnected
              ? 'Connected — brief parsing, quote drafting active'
              : 'Agent processing — set ANTHROPIC_API_KEY in Vercel environment'}
          />
        </div>
      </SectionCard>

      {/* Scheduled Jobs — full width */}
      {cronHealth.length > 0 && (
        <SectionCard
          title="Scheduled jobs"
          meta={cronSecretPresent ? '✓ CRON_SECRET detected' : '✗ CRON_SECRET missing'}
        >
          {!cronSecretPresent && (
            <div className="mb-3 rounded border px-3 py-2 text-[10px]" style={{ borderColor: PALETTE.danger, background: `${PALETTE.danger}10`, color: PALETTE.muted }}>
              No CRON_SECRET in this environment — every cron will return 401. See docs/CRON-OPS-RUNBOOK.md.
            </div>
          )}
          <div className="grid gap-1.5 sm:grid-cols-2 lg:grid-cols-4">
            {cronHealth.map(({ name, last_run }) => {
              const label = name.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
              // eslint-disable-next-line react-hooks/purity
              const ageMs = last_run ? Date.now() - new Date(last_run).getTime() : null;
              const color = ageMs === null
                ? PALETTE.danger
                : ageMs < 24 * 3600_000 ? PALETTE.success
                : ageMs < 48 * 3600_000 ? PALETTE.warning
                : PALETTE.danger;
              const statusLabel = ageMs === null
                ? 'Never run'
                : ageMs < 24 * 3600_000 ? 'Today'
                : ageMs < 48 * 3600_000 ? 'Yesterday'
                : `${Math.floor(ageMs / 86400_000)}d ago`;
              return (
                <div key={name} className="flex items-center justify-between rounded border px-2.5 py-1.5" style={{ borderColor: PALETTE.border }}>
                  <span className="text-[11px] truncate" style={{ color: PALETTE.text }}>{label}</span>
                  <span className="flex items-center gap-1 text-[10px] flex-none ml-2" style={{ color }}>
                    <span className="inline-block h-1.5 w-1.5 rounded-full" style={{ background: color }} />
                    {statusLabel}
                  </span>
                </div>
              );
            })}
          </div>
        </SectionCard>
      )}
    </div>
  );
}

/**
 * Renders the Kill Switch "Last updated …" line. setState-in-effect is
 * intentional — defers locale formatting until after hydration to keep
 * server + client first-paint HTML identical.
 */
function LastUpdatedLine({ updatedAt, updatedBy }: { updatedAt: string; updatedBy: string | null }) {
  const [formatted, setFormatted] = useState<string | null>(null);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- defer locale-dependent rendering until after mount; avoids SSR/CSR hydration mismatch
    setFormatted(new Date(updatedAt).toLocaleString('en-AU'));
  }, [updatedAt]);

  if (!formatted) return null;

  return (
    <div className="mt-2 text-[10px]" style={{ color: PALETTE.muted }}>
      Updated {formatted}{updatedBy && ` by ${updatedBy}`}
    </div>
  );
}

function PushNotificationsSection() {
  const { state, enable, disable } = usePushNotifications();

  if (state === 'unsupported') return (
    <SectionCard title="Push notifications">
      <p className="text-[11px]" style={{ color: PALETTE.muted }}>Not supported in this browser.</p>
    </SectionCard>
  );

  const statusLabel =
    state === 'loading' ? 'Checking…'
    : state === 'granted' ? 'Enabled on this device'
    : state === 'denied' ? 'Blocked by browser'
    : 'Not enabled';

  const statusColor =
    state === 'granted' ? PALETTE.success
    : state === 'denied' ? PALETTE.danger
    : PALETTE.muted;

  return (
    <SectionCard title="Push notifications">
      <p className="text-xs" style={{ color: PALETTE.text }}>
        Browser alerts for new inbox items, hold responses, onboarding completions.
      </p>
      <div className="mt-2 flex items-center justify-between">
        <span className="text-[11px]" style={{ color: statusColor }}>{statusLabel}</span>
        {state !== 'loading' && state !== 'denied' && (
          <button
            type="button"
            onClick={state === 'granted' ? disable : enable}
            className="rounded px-2.5 py-1 text-[11px] font-medium flex-none"
            style={
              state === 'granted'
                ? { background: `${PALETTE.danger}18`, color: PALETTE.danger, border: `1px solid ${PALETTE.danger}33` }
                : { background: `${PALETTE.accent}18`, color: PALETTE.accent, border: `1px solid ${PALETTE.accent}33` }
            }
          >
            {state === 'granted' ? 'Disable' : 'Enable'}
          </button>
        )}
      </div>
    </SectionCard>
  );
}

function InfoField({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0">
      <div className="text-[10px] font-semibold uppercase tracking-wide" style={{ color: PALETTE.muted }}>{label}</div>
      <div className="text-xs font-medium tabular-nums truncate" style={{ color: PALETTE.text }}>{value}</div>
    </div>
  );
}

function IntegrationRow({
  name, status, detail, action,
}: {
  name: string;
  status: 'connected' | 'pending' | 'error';
  detail: string;
  action?: { label: string; href: string };
}) {
  const colors = {
    connected: PALETTE.success,
    pending: PALETTE.warning,
    error: PALETTE.danger,
  };
  return (
    <div className="flex items-center justify-between rounded border px-3 py-2" style={{ borderColor: PALETTE.border }}>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <span className="inline-block h-2 w-2 rounded-full flex-shrink-0" style={{ background: colors[status] }} />
          <div className="text-xs font-medium" style={{ color: PALETTE.text }}>{name}</div>
        </div>
        <div className="text-[10px] mt-0.5 ml-4" style={{ color: PALETTE.muted }}>{detail}</div>
      </div>
      {action && (
        <a
          href={action.href}
          className="ml-3 flex-shrink-0 rounded px-2.5 py-1 text-[11px] font-medium"
          style={{ background: `${PALETTE.accent}22`, color: PALETTE.accent, border: `1px solid ${PALETTE.accent}44` }}
        >
          {action.label}
        </a>
      )}
    </div>
  );
}
