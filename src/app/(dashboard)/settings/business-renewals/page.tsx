import Topbar from '@/components/layout/Topbar';
import { listBusinessRenewals } from '@/lib/data/business-renewals';
import { EXPIRY_DANGER_DAYS, EXPIRY_WARN_DAYS } from '@/lib/data/business-renewals-types';
import { PALETTE } from '@/lib/utils/constants';
import KpiCard, { KpiStrip } from '@/components/ui/KpiCard';
import BusinessRenewalsClient from './BusinessRenewalsClient';

/**
 * Agency-side business renewals dashboard.
 *
 * Pairs with /settings/compliance (which tracks talent + crew document
 * expiries). This page tracks agency-level renewals Jasper has to
 * handle himself: insurance policies, BAS quarterly lodgement, ASIC
 * company review, domain renewals, accountant engagements.
 */
export default async function BusinessRenewalsPage() {
  const rows = await listBusinessRenewals();

  const expiredCount  = rows.filter((r) => r.status === 'expired').length;
  const dangerCount   = rows.filter((r) => r.status === 'danger').length;
  const warningCount  = rows.filter((r) => r.status === 'warning').length;
  const okCount       = rows.filter((r) => r.status === 'ok').length;
  const needAttention = expiredCount + dangerCount;

  return (
    <>
      <Topbar title="Business Renewals" />
      <div className="p-4 sm:p-6 space-y-4">

        <KpiStrip>
          <KpiCard
            label="Expired"
            value={expiredCount}
            sub="renew immediately"
            tone={expiredCount > 0 ? 'danger' : 'default'}
            valueColor={expiredCount > 0 ? PALETTE.danger : undefined}
          />
          <KpiCard
            label={`Due ≤${EXPIRY_DANGER_DAYS}d`}
            value={dangerCount}
            sub="needs renewal soon"
            tone={dangerCount > 0 ? 'danger' : 'default'}
            valueColor={dangerCount > 0 ? PALETTE.danger : undefined}
          />
          <KpiCard
            label={`Due ≤${EXPIRY_WARN_DAYS}d`}
            value={warningCount}
            sub="watch list"
            tone={warningCount > 0 ? 'warn' : 'default'}
            valueColor={warningCount > 0 ? PALETTE.warning : undefined}
          />
          <KpiCard
            label="OK"
            value={okCount}
            sub={`of ${rows.length} tracked`}
            tone={needAttention === 0 && rows.length > 0 ? 'success' : 'default'}
            valueColor={needAttention === 0 && rows.length > 0 ? PALETTE.success : undefined}
          />
        </KpiStrip>

        <p className="text-[11px]" style={{ color: PALETTE.muted }}>
          Agency-side renewals — insurance, BAS, ASIC, domain. Pairs with{' '}
          <a href="/settings/compliance" style={{ color: PALETTE.accent }}>compliance</a>{' '}
          (which tracks talent + crew documents). The unified <code>/api/cron/scheduled-comms</code> route sweeps this daily and queues approval-gated reminders.
        </p>

        <BusinessRenewalsClient rows={rows} />
      </div>
    </>
  );
}
