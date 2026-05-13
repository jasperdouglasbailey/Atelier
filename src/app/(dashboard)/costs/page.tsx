import Topbar from '@/components/layout/Topbar';
import SpendChart from '@/components/costs/SpendChart';
import SeedButton from '@/components/costs/SeedButton';
import { getCostSummary, getMonthlyTotal, getDailySpend } from '@/lib/utils/llm-costs';
import {
  MONTHLY_COST_CAP_AUD,
  MONTHLY_COST_CAP_USD,
  USD_TO_AUD,
  PALETTE,
} from '@/lib/utils/constants';
import { formatCurrency } from '@/lib/utils/format';

export default async function CostsPage() {
  const [agentSummaries, monthlyUsd, dailySpend] = await Promise.all([
    getCostSummary('month'),
    getMonthlyTotal(),
    getDailySpend(30),
  ]);

  const monthlyAud = monthlyUsd * USD_TO_AUD;
  const pct = Math.min(100, (monthlyUsd / MONTHLY_COST_CAP_USD) * 100);
  const barColor = pct >= 80 ? PALETTE.danger : pct >= 50 ? PALETTE.warning : PALETTE.success;

  return (
    <>
      <Topbar title="AI Costs" />
      <div className="p-4 sm:p-6">
        <section
          className="rounded-lg border p-5"
          style={{ background: PALETTE.surface, borderColor: PALETTE.border }}
        >
          <div className="flex flex-wrap items-baseline justify-between gap-3">
            <div>
              <div className="text-xs uppercase tracking-wide" style={{ color: PALETTE.muted }}>
                Monthly spend
              </div>
              <div className="mt-1 text-2xl font-semibold" style={{ color: PALETTE.text }}>
                {formatCurrency(monthlyAud, 'AUD')}
                <span className="ml-2 text-sm font-normal" style={{ color: PALETTE.muted }}>
                  / {formatCurrency(MONTHLY_COST_CAP_AUD, 'AUD')} cap
                </span>
              </div>
              <div className="mt-1 text-xs" style={{ color: PALETTE.muted }}>
                ≈ {formatCurrency(monthlyUsd, 'USD')} at A$1 = US${(1 / USD_TO_AUD).toFixed(3)}
              </div>
            </div>
            {process.env.NODE_ENV === 'development' && <SeedButton />}
          </div>
          <div
            className="mt-4 h-3 w-full overflow-hidden rounded-full"
            style={{ background: PALETTE.bg }}
            role="progressbar"
            aria-valuenow={Math.round(pct)}
            aria-valuemin={0}
            aria-valuemax={100}
          >
            <div
              className="h-full transition-all"
              style={{ width: `${pct}%`, background: barColor }}
            />
          </div>
          <div className="mt-2 text-xs" style={{ color: PALETTE.muted }}>
            {pct.toFixed(1)}% used · {pct >= 80 ? 'over 80% — investigate' : pct >= 50 ? 'past halfway' : 'plenty of headroom'}
          </div>
        </section>

        <section className="mt-6">
          <h2 className="section-title mb-3">
            Spend by agent · this month
          </h2>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {agentSummaries.map((agent) => (
              <div
                key={agent.agentId}
                className="rounded-lg border p-4"
                style={{ background: PALETTE.surface, borderColor: PALETTE.border }}
              >
                <div className="text-sm font-medium" style={{ color: PALETTE.text }}>
                  {agent.label}
                </div>
                <div className="mt-2 text-xl font-semibold" style={{ color: PALETTE.text }}>
                  {formatCurrency(agent.totalUsd * USD_TO_AUD, 'AUD')}
                </div>
                <div className="mt-1 text-xs" style={{ color: PALETTE.muted }}>
                  {agent.callCount} call{agent.callCount === 1 ? '' : 's'}
                  {' · '}
                  {formatCurrency(agent.totalUsd, 'USD')}
                </div>
              </div>
            ))}
          </div>
        </section>

        <section
          className="mt-6 rounded-lg border p-4 sm:p-5"
          style={{ background: PALETTE.surface, borderColor: PALETTE.border }}
        >
          <div className="mb-2 flex items-baseline justify-between">
            <h2 className="text-xs font-semibold uppercase tracking-wide" style={{ color: PALETTE.muted }}>
              Daily spend · last 30 days
            </h2>
            <span className="text-xs" style={{ color: PALETTE.muted }}>AUD</span>
          </div>
          <SpendChart data={dailySpend} />
        </section>
      </div>
    </>
  );
}
