'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { usePushNotifications } from '@/lib/hooks/usePushNotifications';
import type { KillSwitchState } from '@/lib/types/database';
import { toggleKillSwitchAction } from '@/app/actions/kill-switch';
import { PALETTE, DEFAULT_COMMISSION_RATE, DEFAULT_ASF_RATE, GST_RATE, SUPER_RATE_CHARGED, SUPER_RATE_PAID } from '@/lib/utils/constants';
import type { AgencyConfig } from '@/lib/utils/agency-config';

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
    <div className="flex items-center justify-between rounded-lg border px-4 py-3" style={{ borderColor: PALETTE.border }}>
      <div>
        <div className="text-sm font-medium" style={{ color: PALETTE.text }}>{label}</div>
        <div className="text-xs mt-0.5" style={{ color: PALETTE.muted }}>{description}</div>
      </div>
      <button
        onClick={onChange}
        className="relative h-6 w-11 rounded-full transition-colors"
        style={{ background: checked ? color : PALETTE.border }}
      >
        <span
          className="absolute top-0.5 left-0.5 h-5 w-5 rounded-full bg-white transition-transform"
          style={{ transform: checked ? 'translateX(20px)' : 'translateX(0)' }}
        />
      </button>
    </div>
  );
}

export default function SettingsPanel({ killSwitch, agency, integrations, emailFailures = [], cronHealth = [], cronSecretPresent = false }: Props) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);

  const isActive = killSwitch?.is_active ?? false;
  const isPaused = killSwitch?.pause_outbound ?? false;

  async function handleToggle(field: 'is_active' | 'pause_outbound') {
    setBusy(true);
    await toggleKillSwitchAction(field);
    router.refresh();
    setBusy(false);
  }

  // Determine current level
  let level = 'Green';
  let levelColor: string = PALETTE.success;
  let levelDesc = 'All systems operational. Agents can process and send outbound comms.';
  if (isActive) {
    level = 'Red — Full Freeze';
    levelColor = PALETTE.danger;
    levelDesc = 'All agent activity halted. No processing, no outbound messages. Manual-only mode.';
  } else if (isPaused) {
    level = 'Amber — Drafts Only';
    levelColor = PALETTE.warning;
    levelDesc = 'Agents can process and draft, but nothing goes outbound until you release.';
  }

  return (
    <div className="max-w-2xl space-y-6">
      {/* Quick links */}
      <section className="rounded-lg border p-4" style={{ background: PALETTE.surface, borderColor: PALETTE.border }}>
        <h2 className="text-xs font-semibold uppercase tracking-wide mb-3" style={{ color: PALETTE.muted }}>
          Admin
        </h2>
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
      </section>

      {/* Kill Switch */}
      <section className="rounded-lg border p-4" style={{ background: PALETTE.surface, borderColor: PALETTE.border }}>
        <h2 className="text-xs font-semibold uppercase tracking-wide mb-1" style={{ color: PALETTE.muted }}>
          Kill Switch
        </h2>
        <div className="flex items-center gap-2 mb-4">
          <span className="inline-block h-3 w-3 rounded-full" style={{ background: levelColor }} />
          <span className="text-sm font-semibold" style={{ color: levelColor }}>{level}</span>
        </div>
        <p className="text-xs mb-4" style={{ color: PALETTE.muted }}>{levelDesc}</p>

        <div className="space-y-3">
          <Toggle
            label="Full Freeze (Red)"
            description="Halt all agent processing immediately"
            checked={isActive}
            onChange={() => !busy && handleToggle('is_active')}
            color={PALETTE.danger}
          />
          <Toggle
            label="Pause Outbound (Amber)"
            description="Agents draft but don't send — you review everything first"
            checked={isPaused}
            onChange={() => !busy && handleToggle('pause_outbound')}
            color={PALETTE.warning}
          />
        </div>

        {killSwitch?.updated_at && (
          <LastUpdatedLine
            updatedAt={killSwitch.updated_at}
            updatedBy={killSwitch.updated_by ?? null}
          />
        )}
      </section>

      {/* Agency Profile */}
      <section className="rounded-lg border p-4" style={{ background: PALETTE.surface, borderColor: PALETTE.border }}>
        <h2 className="text-xs font-semibold uppercase tracking-wide mb-3" style={{ color: PALETTE.muted }}>
          Agency Profile
        </h2>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
          <InfoField label="Agency Name" value={agency.name} />
          <InfoField label="ABN" value={agency.abn ?? '—'} />
          <InfoField label="Address" value={agency.address ?? '—'} />
          <InfoField label="Email" value={agency.email ?? '—'} />
          <InfoField label="Phone" value={agency.phone ?? '—'} />
          <InfoField label="Quote Validity" value={`${agency.quoteValidityDays} days`} />
          <InfoField label="Payment Terms" value={`${agency.defaultPaymentTermsDays} days`} />
        </div>
        <p className="mt-3 text-[10px]" style={{ color: PALETTE.muted }}>
          Set these values in your environment variables (NEXT_PUBLIC_AGENCY_*). They appear on all quote and invoice documents.
          <br />
          Keys: AGENCY_NAME · AGENCY_ABN · AGENCY_ADDRESS · AGENCY_EMAIL · AGENCY_PHONE · QUOTE_VALIDITY_DAYS · DEFAULT_PAYMENT_TERMS_DAYS
        </p>
      </section>

      {/* Fee Engine Defaults (read-only display) */}
      <section className="rounded-lg border p-4" style={{ background: PALETTE.surface, borderColor: PALETTE.border }}>
        <h2 className="text-xs font-semibold uppercase tracking-wide mb-3" style={{ color: PALETTE.muted }}>
          Fee Engine Defaults
        </h2>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
          <InfoField label="Commission" value={`${(DEFAULT_COMMISSION_RATE * 100).toFixed(0)}%`} />
          <InfoField label="ASF (default)" value={`${(DEFAULT_ASF_RATE * 100).toFixed(0)}%`} />
          <InfoField label="GST" value={`${(GST_RATE * 100).toFixed(0)}%`} />
          <InfoField label="Super (charged)" value={`${(SUPER_RATE_CHARGED * 100).toFixed(0)}%`} />
          <InfoField label="Super (paid)" value={`${(SUPER_RATE_PAID * 100).toFixed(0)}%`} />
        </div>
        <p className="mt-3 text-[10px]" style={{ color: PALETTE.muted }}>
          These are system-wide defaults. ASF rate is adjustable per fee line. Commission is on artist labour only.
          Super applies to crew labour only. These constants are defined in code — changes require a deploy.
        </p>
      </section>

      {/* Integrations Status */}
      <section className="rounded-lg border p-4" style={{ background: PALETTE.surface, borderColor: PALETTE.border }}>
        <h2 className="text-xs font-semibold uppercase tracking-wide mb-3" style={{ color: PALETTE.muted }}>
          Integrations
        </h2>
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
                ? 'Token valid — see scope breakdown below'
              : integrations?.googleStatus === 'invalid_token'
                ? 'Token expired or revoked — reconnect to restore email drafts and Drive'
              : 'Email relay, file delivery, shoot day events — single OAuth grant'
            }
            action={{ label: integrations?.googleStatus === 'not_configured' ? 'Connect Google' : 'Reconnect Google', href: '/api/auth/start/google' }}
          />
          {integrations?.googleStatus === 'connected' && (
            <div className="ml-4 grid grid-cols-2 gap-x-4 gap-y-1 rounded border px-3 py-2.5 text-[11px]" style={{ borderColor: PALETTE.border }}>
              {[
                { label: 'Inbox search (briefs)', scope: 'https://www.googleapis.com/auth/gmail.readonly' },
                { label: 'Gmail drafts', scope: 'https://www.googleapis.com/auth/gmail.modify' },
                { label: 'Send email', scope: 'https://www.googleapis.com/auth/gmail.send' },
                { label: 'Drive folders', scope: 'https://www.googleapis.com/auth/drive.file' },
                { label: 'Calendar events', scope: 'https://www.googleapis.com/auth/calendar.events' },
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
              <div className="mt-1 text-[10px]" style={{ color: PALETTE.muted }}>
                {[...new Set(emailFailures.map((f) => f.action))].join(' · ')}
              </div>
              <div className="mt-0.5 text-[10px]" style={{ color: PALETTE.muted }}>
                Check Gmail connection and resend manually if required.
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
      </section>

      {/* Push notifications */}
      <PushNotificationsSection />


      {/* Cron health */}
      {cronHealth.length > 0 && (
        <section className="rounded-lg border p-4" style={{ background: PALETTE.surface, borderColor: PALETTE.border }}>
          <h2 className="text-xs font-semibold uppercase tracking-wide mb-3" style={{ color: PALETTE.muted }}>
            Scheduled Jobs
          </h2>
          <div
            className="mb-3 flex items-center justify-between rounded border px-3 py-2"
            style={{
              borderColor: cronSecretPresent ? PALETTE.border : PALETTE.danger,
              background: cronSecretPresent ? 'transparent' : `${PALETTE.danger}10`,
            }}
          >
            <div className="text-[11px]" style={{ color: PALETTE.text }}>
              <span style={{ color: cronSecretPresent ? PALETTE.success : PALETTE.danger }}>
                {cronSecretPresent ? '✓' : '✗'}
              </span>{' '}
              <span style={{ color: PALETTE.text }}>
                CRON_SECRET {cronSecretPresent ? 'detected' : 'missing'}
              </span>
              <div className="mt-0.5 text-[10px]" style={{ color: PALETTE.muted }}>
                {cronSecretPresent
                  ? 'Auth header configured. Vercel cron requests will be accepted.'
                  : 'No CRON_SECRET in this environment — every cron will return 401. See docs/CRON-OPS-RUNBOOK.md.'}
              </div>
            </div>
          </div>
          <div className="space-y-1.5">
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
                <div key={name} className="flex items-center justify-between rounded border px-3 py-1.5" style={{ borderColor: PALETTE.border }}>
                  <span className="text-xs" style={{ color: PALETTE.text }}>{label}</span>
                  <span className="flex items-center gap-1.5 text-[10px]" style={{ color }}>
                    <span className="inline-block h-1.5 w-1.5 rounded-full" style={{ background: color }} />
                    {last_run
                      ? `${statusLabel} · ${new Date(last_run).toLocaleString('en-AU', { hour: '2-digit', minute: '2-digit', day: 'numeric', month: 'short' })}`
                      : statusLabel}
                  </span>
                </div>
              );
            })}
          </div>
        </section>
      )}
    </div>
  );
}

/**
 * Renders the Kill Switch "Last updated …" line.
 *
 * Why a separate component: `toLocaleString('en-AU')` returns different
 * strings on the server (UTC) and client (browser locale + timezone) for
 * the same ISO timestamp. React flagged this as hydration mismatch #418
 * on /settings in AUDIT-2026-05-15. Rendering nothing until mount, then
 * the locale-formatted value, keeps server and first-paint HTML identical
 * and lets the client paint in its own timezone on the next tick.
 */
function LastUpdatedLine({ updatedAt, updatedBy }: { updatedAt: string; updatedBy: string | null }) {
  const [formatted, setFormatted] = useState<string | null>(null);

  useEffect(() => {
    // The whole point of this component is to defer locale-dependent
    // rendering until after mount so the server-rendered HTML and the
    // client first-paint HTML match. setState-in-effect IS the pattern
    // here — every alternative (useSyncExternalStore, suppressHydration-
    // Warning, etc.) is heavier or worse.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setFormatted(new Date(updatedAt).toLocaleString('en-AU'));
  }, [updatedAt]);

  if (!formatted) return null;

  return (
    <div className="mt-3 text-[10px]" style={{ color: PALETTE.muted }}>
      Last updated: {formatted}
      {updatedBy && ` by ${updatedBy}`}
    </div>
  );
}

function PushNotificationsSection() {
  const { state, enable, disable } = usePushNotifications();

  if (state === 'unsupported') return null;

  const statusLabel =
    state === 'loading' ? 'Checking…'
    : state === 'granted' ? 'Enabled on this device'
    : state === 'denied' ? 'Blocked by browser — allow in site settings'
    : 'Not enabled';

  const statusColor =
    state === 'granted' ? PALETTE.success
    : state === 'denied' ? PALETTE.danger
    : PALETTE.muted;

  return (
    <section className="rounded-lg border p-4 space-y-3" style={{ background: PALETTE.surface, borderColor: PALETTE.border }}>
      <h2 className="text-xs font-semibold uppercase tracking-wide" style={{ color: PALETTE.muted }}>
        Push Notifications
      </h2>
      <div className="flex items-center justify-between">
        <div>
          <p className="text-sm" style={{ color: PALETTE.text }}>
            Receive browser notifications for new inbox items, hold responses, and onboarding completions.
          </p>
          <p className="text-[11px] mt-0.5" style={{ color: statusColor }}>{statusLabel}</p>
        </div>
        {state !== 'loading' && state !== 'denied' && (
          <button
            type="button"
            onClick={state === 'granted' ? disable : enable}
            className="ml-4 rounded px-3 py-1 text-xs font-medium flex-shrink-0"
            style={
              state === 'granted'
                ? { background: `${PALETTE.danger}18`, color: PALETTE.danger, border: `1px solid ${PALETTE.danger}33` }
                : { background: `${PALETTE.accent}18`, color: PALETTE.accent, border: `1px solid ${PALETTE.accent}33` }
            }
          >
            {state === 'granted' ? 'Disable' : 'Enable notifications'}
          </button>
        )}
      </div>
    </section>
  );
}

function InfoField({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="text-[10px] font-semibold uppercase" style={{ color: PALETTE.muted }}>{label}</div>
      <div className="text-sm font-medium tabular-nums" style={{ color: PALETTE.text }}>{value}</div>
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
    <div className="flex items-center justify-between rounded border px-3 py-2.5" style={{ borderColor: PALETTE.border }}>
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
          className="ml-3 flex-shrink-0 rounded px-3 py-1 text-[11px] font-medium"
          style={{ background: `${PALETTE.accent}22`, color: PALETTE.accent, border: `1px solid ${PALETTE.accent}44` }}
        >
          {action.label}
        </a>
      )}
    </div>
  );
}
