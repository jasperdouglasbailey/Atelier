import Topbar from '@/components/layout/Topbar';
import { listBusinessRenewals } from '@/lib/data/business-renewals';
import { PALETTE } from '@/lib/utils/constants';
import BusinessRenewalsClient from './BusinessRenewalsClient';

/**
 * Agency-side business renewals dashboard.
 *
 * Pairs with /settings/compliance (which tracks talent + crew document
 * expiries). This page tracks agency-level renewals Jasper has to
 * handle himself: insurance policies, BAS quarterly lodgement, ASIC
 * company review, domain renewals, accountant engagements.
 *
 * The cron at /api/cron/compliance-pings (extended in PR#34) sweeps
 * this table daily and queues approval-gated reminder emails to Jasper
 * when something is ≤30 days from expiry.
 */
export default async function BusinessRenewalsPage() {
  const rows = await listBusinessRenewals();
  const concerns = rows.filter((r) => r.status === 'expired' || r.status === 'danger' || r.status === 'warning');

  return (
    <>
      <Topbar title="Business Renewals" />
      <div className="p-4 sm:p-6 max-w-5xl space-y-4">
        <p className="text-xs" style={{ color: PALETTE.muted }}>
          Agency-side renewals — insurance, BAS, ASIC, domain. Pairs with{' '}
          <a href="/settings/compliance" style={{ color: PALETTE.accent }}>compliance</a>{' '}
          (which tracks talent + crew documents).
        </p>

        {rows.length > 0 && (
          <div className="text-xs" style={{ color: PALETTE.muted }}>
            {rows.length} active renewal{rows.length === 1 ? '' : 's'}
            {concerns.length > 0 && (
              <span className="ml-2 rounded-full px-2 py-0.5 font-semibold" style={{ background: `${PALETTE.warning}22`, color: PALETTE.warning }}>
                {concerns.length} need attention
              </span>
            )}
          </div>
        )}

        <BusinessRenewalsClient rows={rows} />
      </div>
    </>
  );
}
