import Link from 'next/link';
import Topbar from '@/components/layout/Topbar';
import { getComplianceReport, EXPIRY_WARN_DAYS, EXPIRY_DANGER_DAYS, type ExpiryStatus } from '@/lib/data/compliance';
import { PALETTE } from '@/lib/utils/constants';
import { formatDate } from '@/lib/utils/format';

/**
 * Compliance dashboard.
 *
 * Surfaces two concerns for each active talent / crew member:
 *   1. Expiring or missing documents (passport, licence, WWCC, visa).
 *   2. Missing critical data (ABN, emergency contact, onboarding incomplete).
 *
 * Colour coding:
 *   Red   — expired or ≤30 days
 *   Amber — ≤90 days
 *   Green — OK
 *   Muted — not provided (missing; may not apply to all artists)
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

function ExpiryCell({
  status,
  expiry,
}: {
  status: ExpiryStatus | 'missing';
  expiry: string | null;
}) {
  const colour = statusColour(status);
  return (
    <span className="text-[11px]" style={{ color: colour }}>
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

function SectionHeader({ title, count, concern }: { title: string; count: number; concern: number }) {
  return (
    <div className="flex items-center justify-between mb-3">
      <h2 className="text-xs font-semibold uppercase tracking-wider" style={{ color: PALETTE.muted }}>
        {title}
      </h2>
      <div className="flex items-center gap-3 text-[11px]" style={{ color: PALETTE.muted }}>
        <span>{count} total</span>
        {concern > 0 && (
          <span
            className="rounded-full px-2 py-0.5 font-semibold"
            style={{ background: `${PALETTE.warning}22`, color: PALETTE.warning }}
          >
            {concern} need attention
          </span>
        )}
      </div>
    </div>
  );
}

export default async function CompliancePage() {
  const report = await getComplianceReport();
  const { talent, crew } = report;

  const talentConcerns = talent.filter((t) => t.hasConcern);
  const crewConcerns = crew.filter((c) => c.hasConcern);

  const totalConcerns = talentConcerns.length + crewConcerns.length;

  return (
    <>
      <Topbar title="Compliance" />
      <div className="p-4 sm:p-6 max-w-5xl space-y-8">

        {/* Header + key */}
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className="text-xs mt-0.5" style={{ color: PALETTE.muted }}>
              Documents expiring within {EXPIRY_WARN_DAYS} days and missing compliance data.
            </p>
          </div>
          <div className="flex items-center gap-4 text-[11px]">
            <span style={{ color: PALETTE.danger }}>■ Expired / ≤{EXPIRY_DANGER_DAYS}d</span>
            <span style={{ color: PALETTE.warning }}>■ ≤{EXPIRY_WARN_DAYS}d</span>
            <span style={{ color: PALETTE.success }}>■ OK</span>
            <span style={{ color: PALETTE.muted }}>■ Not provided</span>
          </div>
        </div>

        {totalConcerns === 0 && (
          <div
            className="rounded-lg border px-5 py-4 text-sm"
            style={{ background: PALETTE.surface, borderColor: PALETTE.border, color: PALETTE.success }}
          >
            All active talent and crew are compliant. No issues found.
          </div>
        )}

        {/* ── Talent ─────────────────────────────────────────── */}
        <section>
          <SectionHeader
            title="Talent"
            count={talent.filter((t) => t.is_active).length}
            concern={talentConcerns.length}
          />
          <div className="rounded-lg border overflow-hidden" style={{ borderColor: PALETTE.border }}>
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b" style={{ background: PALETTE.surface, borderColor: PALETTE.border }}>
                  <th className="px-3 py-2 text-left font-semibold" style={{ color: PALETTE.muted }}>Artist</th>
                  <th className="px-3 py-2 text-left font-semibold" style={{ color: PALETTE.muted }}>Passport</th>
                  <th className="px-3 py-2 text-left font-semibold" style={{ color: PALETTE.muted }}>Licence</th>
                  <th className="px-3 py-2 text-left font-semibold" style={{ color: PALETTE.muted }}>WWCC</th>
                  <th className="px-3 py-2 text-left font-semibold" style={{ color: PALETTE.muted }}>Visa</th>
                  <th className="px-3 py-2 text-left font-semibold" style={{ color: PALETTE.muted }}>Missing</th>
                </tr>
              </thead>
              <tbody className="divide-y" style={{ borderColor: PALETTE.border }}>
                {talent.map((t) => {
                  const rowBg = !t.is_active ? `${PALETTE.muted}08` : t.hasConcern ? `${PALETTE.warning}07` : 'transparent';
                  return (
                    <tr key={t.id} style={{ background: rowBg }}>
                      <td className="px-3 py-2.5">
                        <div className="flex items-center gap-2">
                          <Link
                            href={`/talent/${t.id}`}
                            className="font-medium hover:underline"
                            style={{ color: t.is_active ? PALETTE.text : PALETTE.muted }}
                          >
                            {t.working_name}
                          </Link>
                          {!t.is_active && (
                            <span className="text-[10px]" style={{ color: PALETTE.muted }}>(archived)</span>
                          )}
                          {t.is_active && !t.onboarding_completed && (
                            <span
                              className="rounded px-1 py-0.5 text-[9px] font-semibold uppercase tracking-wide"
                              style={{ background: `${PALETTE.muted}22`, color: PALETTE.muted }}
                            >
                              Not onboarded
                            </span>
                          )}
                        </div>
                        {t.email && (
                          <div className="text-[10px] mt-0.5 truncate max-w-[160px]" style={{ color: PALETTE.muted }}>
                            {t.email}
                          </div>
                        )}
                      </td>
                      <td className="px-3 py-2.5">
                        <ExpiryCell status={t.passportStatus} expiry={t.passport_expiry} />
                      </td>
                      <td className="px-3 py-2.5">
                        <ExpiryCell status={t.licenceStatus} expiry={t.drivers_licence_expiry} />
                      </td>
                      <td className="px-3 py-2.5">
                        <div>
                          <ExpiryCell status={t.wwccStatus} expiry={t.wwcc_expiry} />
                          {t.wwcc_number && (
                            <div className="text-[10px] mt-0.5" style={{ color: PALETTE.muted }}>#{t.wwcc_number}</div>
                          )}
                        </div>
                      </td>
                      <td className="px-3 py-2.5">
                        <ExpiryCell status={t.visaStatus} expiry={t.visa_expiry} />
                      </td>
                      <td className="px-3 py-2.5">
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
                    <td colSpan={6} className="px-3 py-4 text-center" style={{ color: PALETTE.muted }}>
                      No talent records.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </section>

        {/* ── Crew ───────────────────────────────────────────── */}
        <section>
          <SectionHeader
            title="Crew"
            count={crew.filter((c) => c.is_active).length}
            concern={crewConcerns.length}
          />
          <div className="rounded-lg border overflow-hidden" style={{ borderColor: PALETTE.border }}>
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b" style={{ background: PALETTE.surface, borderColor: PALETTE.border }}>
                  <th className="px-3 py-2 text-left font-semibold" style={{ color: PALETTE.muted }}>Crew member</th>
                  <th className="px-3 py-2 text-left font-semibold" style={{ color: PALETTE.muted }}>Onboarded</th>
                  <th className="px-3 py-2 text-left font-semibold" style={{ color: PALETTE.muted }}>Missing</th>
                </tr>
              </thead>
              <tbody className="divide-y" style={{ borderColor: PALETTE.border }}>
                {crew.map((c) => {
                  const rowBg = !c.is_active ? `${PALETTE.muted}08` : c.hasConcern ? `${PALETTE.warning}07` : 'transparent';
                  return (
                    <tr key={c.id} style={{ background: rowBg }}>
                      <td className="px-3 py-2.5">
                        <div className="flex items-center gap-2">
                          <Link
                            href={`/crew/${c.id}`}
                            className="font-medium hover:underline"
                            style={{ color: c.is_active ? PALETTE.text : PALETTE.muted }}
                          >
                            {c.name}
                          </Link>
                          {!c.is_active && (
                            <span className="text-[10px]" style={{ color: PALETTE.muted }}>(archived)</span>
                          )}
                        </div>
                        {c.email && (
                          <div className="text-[10px] mt-0.5" style={{ color: PALETTE.muted }}>{c.email}</div>
                        )}
                      </td>
                      <td className="px-3 py-2.5">
                        <span style={{ color: c.onboarding_completed ? PALETTE.success : PALETTE.warning }}>
                          {c.onboarding_completed ? '✓ Yes' : 'Pending'}
                        </span>
                      </td>
                      <td className="px-3 py-2.5">
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
                    <td colSpan={3} className="px-3 py-4 text-center" style={{ color: PALETTE.muted }}>
                      No crew records.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </section>

        {/* Footer note */}
        <p className="text-[11px]" style={{ color: PALETTE.muted }}>
          Click any name to open their profile and update documents.
          Compliance thresholds: red = expired or ≤{EXPIRY_DANGER_DAYS} days, amber = ≤{EXPIRY_WARN_DAYS} days.
          Last checked: {new Date(report.asAt).toLocaleString('en-AU', { timeZone: 'Australia/Sydney' })}.
        </p>
      </div>
    </>
  );
}
