'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import type { KillSwitchState } from '@/lib/types/database';
import { toggleKillSwitchAction } from '@/app/actions/kill-switch';
import { PALETTE, DEFAULT_COMMISSION_RATE, DEFAULT_ASF_RATE, GST_RATE, SUPER_RATE_CHARGED, SUPER_RATE_PAID } from '@/lib/utils/constants';
import type { AgencyConfig } from '@/lib/utils/agency-config';

type IntegrationStatus = { googleConnected: boolean; xeroConnected: boolean; anthropicConnected: boolean };
type Props = { killSwitch: KillSwitchState | null; agency: AgencyConfig; integrations?: IntegrationStatus };

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

export default function SettingsPanel({ killSwitch, agency, integrations }: Props) {
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
          <div className="mt-3 text-[10px]" style={{ color: PALETTE.muted }}>
            Last updated: {new Date(killSwitch.updated_at).toLocaleString('en-AU')}
            {killSwitch.updated_by && ` by ${killSwitch.updated_by}`}
          </div>
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
            status={integrations?.googleConnected ? 'connected' : 'pending'}
            detail={integrations?.googleConnected
              ? 'Connected — Gmail, Drive, and Calendar active'
              : 'Email relay, file delivery, shoot day events — single OAuth grant'}
            action={!integrations?.googleConnected ? { label: 'Connect Google', href: '/api/auth/start/google' } : undefined}
          />
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
    </div>
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
