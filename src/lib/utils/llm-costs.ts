import { createClient } from '@/lib/supabase/server';
import { AGENTS, type AgentId } from '@/lib/utils/constants';

export type LogLLMCallInput = {
  agentName: AgentId | string;
  model: string;
  inputTokens: number;
  outputTokens: number;
  estimatedCostUsd: number;
  bookingId?: string | null;
  durationMs?: number | null;
};

export async function logLLMCall(input: LogLLMCallInput): Promise<void> {
  try {
    const supabase = await createClient();
    const { error } = await supabase.from('llm_calls').insert({
      agent_name: input.agentName,
      model: input.model,
      input_tokens: input.inputTokens,
      output_tokens: input.outputTokens,
      estimated_cost_usd: input.estimatedCostUsd,
      booking_id: input.bookingId ?? null,
      duration_ms: input.durationMs ?? null,
    });
    if (error) console.error('[llm-costs] insert failed', error.message);
  } catch (err) {
    console.error('[llm-costs] threw', err);
  }
}

export type CostPeriod = 'day' | 'week' | 'month';

function periodStart(period: CostPeriod): Date {
  const d = new Date();
  if (period === 'day') {
    d.setHours(0, 0, 0, 0);
  } else if (period === 'week') {
    const day = d.getDay();
    d.setDate(d.getDate() - day);
    d.setHours(0, 0, 0, 0);
  } else {
    d.setDate(1);
    d.setHours(0, 0, 0, 0);
  }
  return d;
}

export type AgentSummary = {
  agentId: string;
  label: string;
  totalUsd: number;
  callCount: number;
};

/**
 * Aggregates llm_calls cost & call counts per agent over the requested period.
 * Aggregation runs in JS rather than SQL because Supabase doesn't expose a
 * generic group-by; the volume here is small enough that it doesn't matter.
 */
export async function getCostSummary(period: CostPeriod): Promise<AgentSummary[]> {
  const since = periodStart(period).toISOString();
  const supabase = await createClient();
  const { data, error } = await supabase
    .from('llm_calls')
    .select('agent_name, estimated_cost_usd')
    .gte('created_at', since);

  if (error) {
    console.error('[llm-costs] summary failed', error.message);
    return AGENTS.map((a) => ({ agentId: a.id, label: a.label, totalUsd: 0, callCount: 0 }));
  }

  const totals = new Map<string, { totalUsd: number; callCount: number }>();
  for (const row of (data ?? []) as { agent_name: string; estimated_cost_usd: number }[]) {
    const cur = totals.get(row.agent_name) ?? { totalUsd: 0, callCount: 0 };
    cur.totalUsd += Number(row.estimated_cost_usd) || 0;
    cur.callCount += 1;
    totals.set(row.agent_name, cur);
  }

  return AGENTS.map((a) => {
    const t = totals.get(a.id) ?? { totalUsd: 0, callCount: 0 };
    return { agentId: a.id, label: a.label, totalUsd: t.totalUsd, callCount: t.callCount };
  });
}

export async function getMonthlyTotal(): Promise<number> {
  const since = periodStart('month').toISOString();
  const supabase = await createClient();
  const { data, error } = await supabase
    .from('llm_calls')
    .select('estimated_cost_usd')
    .gte('created_at', since);

  if (error) {
    console.error('[llm-costs] monthly total failed', error.message);
    return 0;
  }
  return ((data ?? []) as { estimated_cost_usd: number }[]).reduce(
    (sum, r) => sum + (Number(r.estimated_cost_usd) || 0),
    0,
  );
}

export type DailySpend = { date: string; totalUsd: number };

/**
 * Returns one row per day for the last `days` days, including days with zero
 * spend so the chart has a continuous x-axis.
 */
export async function getDailySpend(days = 30): Promise<DailySpend[]> {
  const since = new Date();
  since.setHours(0, 0, 0, 0);
  since.setDate(since.getDate() - (days - 1));

  const supabase = await createClient();
  const { data, error } = await supabase
    .from('llm_calls')
    .select('created_at, estimated_cost_usd')
    .gte('created_at', since.toISOString())
    .order('created_at', { ascending: true });

  if (error) {
    console.error('[llm-costs] daily spend failed', error.message);
    return [];
  }

  const buckets = new Map<string, number>();
  for (let i = 0; i < days; i++) {
    const d = new Date(since);
    d.setDate(since.getDate() + i);
    buckets.set(d.toISOString().slice(0, 10), 0);
  }
  for (const row of (data ?? []) as { created_at: string; estimated_cost_usd: number }[]) {
    const key = row.created_at.slice(0, 10);
    buckets.set(key, (buckets.get(key) ?? 0) + (Number(row.estimated_cost_usd) || 0));
  }

  return Array.from(buckets.entries()).map(([date, totalUsd]) => ({ date, totalUsd }));
}
