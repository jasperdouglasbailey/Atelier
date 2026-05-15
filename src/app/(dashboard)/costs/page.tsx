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
import KpiCard, { KpiStrip } from '@/components/ui/KpiCard';
import SectionCard from '@/components/ui/SectionCard';

export default async function CostsPage() {
  const [agentSummaries, monthlyUsd, dailySpend] = await Promise.all([
    getCostSummary('month'),
    getMonthlyTotal(),
    getDailySpend(30),
  ]);

  const monthlyAud = monthlyUsd * USD_TO_AUD;
  const pct = Math.min(100, (monthlyUsd / MONTHLY_COST_CAP_USD) * 100);
  const barColor = pct >= 80 ? PALETTE.danger : pct >= 50 ? PALETTE.warning : PALETTE.success;
  const totalCalls = agentSummaries.reduce((s, a) => s + a.callCount, 0);
  const topAgent = agentSummaries[0]?.label ?? '—';

  return (
    <>
      <Topbar title="AI Costs" />
      <div className="p-4 sm:p-6 space-y-4">

        <KpiStrip>
          <KpiCard
            label="Monthly spend"
            value={formatCurrency(monthlyAud, 'AUD')}
            sub={`of ${formatCurrency(MONTHLY_COST_CAP_AUD, 'AUD')} cap`}
            accent
          />
          <KpiCard
            label="Cap used"
            value={`${pct.toFixed(0)}%`}
            sub={pct >= 80 ? 'over 80% — investigate' : pct >= 50 ? 'past halfway' : 'plenty of headroom'}
            tone={pct >= 80 ? 'danger' : pct >= 50 ? 'warn' : 'success'}
            valueColor={barColor}
          />
          <KpiCard
            label="Calls this month"
            value={totalCalls.toLocaleString()}
            sub={`across ${agentSummaries.length} agent${agentSummaries.length !== 1 ? 's' : ''}`}
          />
          <KpiCard
            label="Top spender"
            value={topAgent}
            sub={agentSummaries[0] ? `${formatCurrency(agentSummaries[0].totalUsd * USD_TO_AUD, 'AUD')} · ${agentSummaries[0].callCount} call${agentSummaries[0].callCount !== 1 ? 's' : ''}` : ''}
          />
        </KpiStrip>

        {/* Cap progress bar */}
        <SectionCard title="Cap utilisation" meta={`${formatCurrency(monthlyAud, 'AUD')} / ${formatCurrency(MONTHLY_COST_CAP_AUD, 'AUD')}`}>
          <div className="space-y-2">
            <div
              className="h-3 w-full overflow-hidden rounded-full"
              style={{ background: PALETTE.bg }}
              role="progressbar"
              aria-valuenow={Math.round(pct)}
              aria-valuemin={0}
              aria-valuemax={100}
            >
              <div className="h-full transition-all" style={{ width: `${pct}%`, background: barColor }} />
            </div>
            <div className="flex items-center justify-between text-[11px]">
              <span style={{ color: PALETTE.muted }}>
                ≈ {formatCurrency(monthlyUsd, 'USD')} at A$1 = US${(1 / USD_TO_AUD).toFixed(3)}
              </span>
              {process.env.NODE_ENV === 'development' && <SeedButton />}
            </div>
          </div>
        </SectionCard>

        {/* Per-agent cards */}
        <SectionCard title="Spend by agent · this month">
          {agentSummaries.length === 0 ? (
            <p className="text-xs" style={{ color: PALETTE.muted }}>No LLM calls this month yet.</p>
          ) : (
            <div className="grid gap-3 grid-cols-2 sm:grid-cols-3 lg:grid-cols-4">
              {agentSummaries.map((agent) => (
                <div
                  key={agent.agentId}
                  className="rounded-lg border p-3"
                  style={{ background: PALETTE.bg, borderColor: PALETTE.border }}
                >
                  <div className="text-[11px] font-medium truncate" style={{ color: PALETTE.text }}>
                    {agent.label}
                  </div>
                  <div className="mt-1 text-lg font-semibold tabular-nums" style={{ color: PALETTE.text }}>
                    {formatCurrency(agent.totalUsd * USD_TO_AUD, 'AUD')}
                  </div>
                  <div className="mt-0.5 text-[10px]" style={{ color: PALETTE.muted }}>
                    {agent.callCount} call{agent.callCount === 1 ? '' : 's'} · {formatCurrency(agent.totalUsd, 'USD')}
                  </div>
                </div>
              ))}
            </div>
          )}
        </SectionCard>

        <SectionCard title="Daily spend · last 30 days" meta="AUD">
          <SpendChart data={dailySpend} />
        </SectionCard>

      </div>
    </>
  );
}
