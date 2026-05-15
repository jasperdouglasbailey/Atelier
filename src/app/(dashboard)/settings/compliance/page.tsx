import Link from 'next/link';
import Topbar from '@/components/layout/Topbar';
import { getComplianceReport, EXPIRY_WARN_DAYS, EXPIRY_DANGER_DAYS, type ExpiryStatus } from '@/lib/data/compliance';
import { PALETTE } from '@/lib/utils/constants';
import { formatDate } from '@/lib/utils/format';
import KpiCard, { KpiStrip } from '@/components/ui/KpiCard';
import SectionCard from '@/components/ui/SectionCard';

/**
 * Compliance dashboard.
 *
 * Surfaces two concerns for each active talent / crew member:
 *   1. Expiring or missing documents (passport, licence, WWCC, visa).
 *   2. Missing critical data (ABN, emergency contact, onboarding incomplete).
 */

function statusColour(status: ExpiryStatus | 'missing'): string {
  switch (status) {
    case 'expired':
    case 'danger':  return PALETTE.danger;
    case 'warning': return PALETTE.warning;
    case 'ok':      return PALETTE.success;
    case 'missing': return PALETTE.muted;
  }
}

function statusLabel(status: ExpiryStatus | 'missing', expiry: string | null): string {
  if (status === 'missing') return 'Not provided';
  if (!expiry) return '—';
  const days = Math.floor((new Date(expiry).getTime() - Date.now()) / (1000 * 60 * 60 * 24));
  if (days <= 0) return `Expired ${formatDate(expiry)}`;
  if (days <= EXPIRY_DANGER_DAYS) return `${formatDate(expiry)} (${days}d)`;
  if (days <= EXPIRY_WARN_DAYS) return `${formatDate(expiry)} (${days}d)`;
  return formatDate(expiry);
}

function ExpiryCell({ status, expiry }: { status: ExpiryStatus | 'missing'; expiry: string | null }) {
  return (
    <span className="text-[11px]" style={{ color: statusColour(status) }}>
      {statusLabel(status, expiry)}
    </span>
  );
}

function MissingPill({ label }: { label: string }) {
  return (
    <span
      className="rounded px-1.5 py-0.5 text-[10px] font-medium"
      style={{ background: `${PALETTE.warning}22`, color: PALETTE.warning }}
    >
      {label}
    </span>
  );
}

export default async function CompliancePage() {
  const report = await getComplianceReport();
  const { talent, crew } = report;

  // KPI calculations — across talent + crew, active only.
  const allActive = [...talent.filter((t) => t.is_active), ...crew.filter((c) => c.is_active)];
  const totalPeople = allActive.length;

  let expiringRed = 0;
  let expiringAmber = 0;
  for (const t of talent.filter((x) => x.is_active)) {
    for (const s of [t.passportStatus, t.licenceStatus, t.wwccStatus, t.visaStatus]) {
      if (s === 'expired' || s === 'danger') expiringRed++;
      else if (s === 'warning') expiringAmber++;
    }
  }
  const concernsCount = talent.filter((t) => t.hasConcern).length + crew.filter((c) => c.hasConcern).length;
  const compliantCount = totalPeople - concernsCount;

  return (
    <>
      <Topbar title="Compliance" />
      <div className="p-4 sm:p-6 space-y-4">

        <KpiStrip>
          <KpiCard label="People tracked" value={totalPeople} sub="active talent + crew" />
          <KpiCard
            label={`Expiring ≤${EXPIRY_DANGER_DAYS}d`}
            value={expiringRed}
            sub="needs renewal now"
            tone={expiringRed > 0 ? 'danger' : 'default'}
            valueColor={expiringRed > 0 ? PALETTE.danger : undefined}
          />
          <KpiCard
            label={`Expiring ≤${EXPIRY_WARN_DAYS}d`}
            value={expiringAmber}
            sub="watch list"
            tone={expiringAmber > 0 ? 'warn' : 'default'}
            valueColor={expiringAmber > 0 ? PALETTE.warning : undefined}
          />
          <KpiCard
            label="All compliant"
            value={compliantCount}
            sub={`of ${totalPeople}`}
            tone={concernsCount === 0 && totalPeople > 0 ? 'success' : 'default'}
            valueColor={concernsCount === 0 && totalPeople > 0 ? PALETTE.success : undefined}
          />
        </KpiStrip>

        <p className="text-[11px]" style={{ color: PALETTE.muted }}>
          <span style={{ color: PALETTE.danger }}>■</span> Expired / ≤{EXPIRY_DANGER_DAYS}d  ·{' '}
          <span style={{ color: PALETTE.warning }}>■</span> ≤{EXPIRY_WARN_DAYS}d  ·{' '}
          <span style={{ color: PALETTE.success }}>■</span> OK  ·{' '}
          <span style={{ color: PALETTE.muted }}>■</span> Not provided
        </p>

        <SectionCard
          title="Talent"
          meta={`${talent.filter((t) => t.is_active).length} active${talent.filter((t) => t.hasConcern).length > 0 ? ` · ${talent.filter((t) => t.hasConcern).length} need attention` : ''}`}
        >
          <div className="overflow-x-auto -mx-4 sm:-mx-0">
            <table className="w-full text-xs">
              <thead>
                <tr style={{ borderBottom: `1px solid ${PALETTE.border}` }}>
                  <th className="px-3 py-2 text-left text-[10px] font-semibold uppercase tracking-wide" style={{ color: PALETTE.muted }}>Artist</th>
                  <th className="px-3 py-2 text-left text-[10px] font-semibold uppercase tracking-wide" style={{ color: PALETTE.muted }}>Passport</th>
                  <th className="px-3 py-2 text-left text-[10px] font-semibold uppercase tracking-wide" style={{ color: PALETTE.muted }}>Licence</th>
                  <th className="px-3 py-2 text-left text-[10px] font-semibold uppercase tracking-wide" style={{ color: PALETTE.muted }}>WWCC</th>
                  <th className="px-3 py-2 text-left text-[10px] font-semibold uppercase tracking-wide" style={{ color: PALETTE.muted }}>Visa</th>
                  <th className="px-3 py-2 text-left text-[10px] font-semibold uppercase tracking-wide" style={{ color: PALETTE.muted }}>Missing</th>
                </tr>
              </thead>
              <tbody>
                {talent.map((t) => {
                  const rowBg = !t.is_active ? `${PALETTE.muted}08` : t.hasConcern ? `${PALETTE.warning}07` : 'transparent';
                  return (
                    <tr key={t.id} style={{ background: rowBg, borderTop: `1px solid ${PALETTE.border}` }}>
                      <td className="px-3 py-2">
                        <div className="flex items-center gap-2">
                          <Link
                            href={`/talent/${t.id}`}
                            className="font-medium hover:underline"
                            style={{ color: t.is_active ? PALETTE.text : PALETTE.muted }}
                          >
                            {t.working_name}
                          </Link>
                          {!t.is_active && <span className="text-[10px]" style={{ color: PALETTE.muted }}>(archived)</span>}
                          {t.is_active && !t.onboarding_completed && (
                            <span
                              className="rounded px-1 py-0.5 text-[9px] font-semibold uppercase tracking-wide"
                              style={{ background: `${PALETTE.muted}22`, color: PALETTE.muted }}
                            >
                              Not onboarded
                            </span>
                          )}
                        </div>
                      </td>
                      <td className="px-3 py-2"><ExpiryCell status={t.passportStatus} expiry={t.passport_expiry} /></td>
                      <td className="px-3 py-2"><ExpiryCell status={t.licenceStatus} expiry={t.drivers_licence_expiry} /></td>
                      <td className="px-3 py-2">
                        <ExpiryCell status={t.wwccStatus} expiry={t.wwcc_expiry} />
                        {t.wwcc_number && <div className="text-[10px]" style={{ color: PALETTE.muted }}>#{t.wwcc_number}</div>}
                      </td>
                      <td className="px-3 py-2"><ExpiryCell status={t.visaStatus} expiry={t.visa_expiry} /></td>
                      <td className="px-3 py-2">
                        <div className="flex flex-wrap gap-1">
                          {t.missingAbn && <MissingPill label="ABN" />}
                          {t.missingEmergencyContact && <MissingPill label="Emergency" />}
                          {t.missingMobile && <MissingPill label="Mobile" />}
                          {t.missingSuperFund && t.is_active && <MissingPill label="Super" />}
                          {!t.hasConcern && <span style={{ color: PALETTE.success }}>✓</span>}
                        </div>
                      </td>
                    </tr>
                  );
                })}
                {talent.length === 0 && (
                  <tr>
                    <td colSpan={6} className="px-3 py-6 text-center" style={{ color: PALETTE.muted }}>No talent records.</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </SectionCard>

        <SectionCard
          title="Crew"
          meta={`${crew.filter((c) => c.is_active).length} active${crew.filter((c) => c.hasConcern).length > 0 ? ` · ${crew.filter((c) => c.hasConcern).length} need attention` : ''}`}
        >
          <div className="overflow-x-auto -mx-4 sm:-mx-0">
            <table className="w-full text-xs">
              <thead>
                <tr style={{ borderBottom: `1px solid ${PALETTE.border}` }}>
                  <th className="px-3 py-2 text-left text-[10px] font-semibold uppercase tracking-wide" style={{ color: PALETTE.muted }}>Crew member</th>
                  <th className="px-3 py-2 text-left text-[10px] font-semibold uppercase tracking-wide" style={{ color: PALETTE.muted }}>Onboarded</th>
                  <th className="px-3 py-2 text-left text-[10px] font-semibold uppercase tracking-wide" style={{ color: PALETTE.muted }}>Missing</th>
                </tr>
              </thead>
              <tbody>
                {crew.map((c) => {
                  const rowBg = !c.is_active ? `${PALETTE.muted}08` : c.hasConcern ? `${PALETTE.warning}07` : 'transparent';
                  return (
                    <tr key={c.id} style={{ background: rowBg, borderTop: `1px solid ${PALETTE.border}` }}>
                      <td className="px-3 py-2">
                        <Link
                          href={`/crew/${c.id}`}
                          className="font-medium hover:underline"
                          style={{ color: c.is_active ? PALETTE.text : PALETTE.muted }}
                        >
                          {c.name}
                        </Link>
                        {!c.is_active && <span className="ml-2 text-[10px]" style={{ color: PALETTE.muted }}>(archived)</span>}
                      </td>
                      <td className="px-3 py-2">
                        <span style={{ color: c.onboarding_completed ? PALETTE.success : PALETTE.warning }}>
                          {c.onboarding_completed ? '✓ Yes' : 'Pending'}
                        </span>
                      </td>
                      <td className="px-3 py-2">
                        <div className="flex flex-wrap gap-1">
                          {c.missingAbn && <MissingPill label="ABN" />}
                          {c.missingSuperFund && c.is_active && <MissingPill label="Super" />}
                          {c.missingMobile && <MissingPill label="Mobile" />}
                          {!c.hasConcern && <span style={{ color: PALETTE.success }}>✓</span>}
                        </div>
                      </td>
                    </tr>
                  );
                })}
                {crew.length === 0 && (
                  <tr>
                    <td colSpan={3} className="px-3 py-6 text-center" style={{ color: PALETTE.muted }}>No crew records.</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </SectionCard>

        <p className="text-[11px]" style={{ color: PALETTE.muted }}>
          Click any name to open their profile and update documents.
          Last checked: {new Date(report.asAt).toLocaleString('en-AU', { timeZone: 'Australia/Sydney' })}.
        </p>
      </div>
    </>
  );
}
