import { createClient } from '@/lib/supabase/server';
import { AGENTS } from '@/lib/utils/constants';

const MODELS = [
  { name: 'claude-sonnet-4-5', inPer1k: 0.003, outPer1k: 0.015 },
  { name: 'claude-haiku-4-5', inPer1k: 0.0008, outPer1k: 0.004 },
  { name: 'gpt-4o-mini', inPer1k: 0.00015, outPer1k: 0.0006 },
];

function rand(min: number, max: number) {
  return Math.random() * (max - min) + min;
}

function randInt(min: number, max: number) {
  return Math.floor(rand(min, max + 1));
}

/**
 * Inserts ~`count` mock atelier_llm_calls rows distributed across the last 30 days.
 * Idempotent-ish: pass replace=true to wipe existing rows first. Useful while
 * the real agents aren't logging yet.
 */
export async function seedMockCosts({
  count = 50,
  replace = false,
}: { count?: number; replace?: boolean } = {}): Promise<{ inserted: number }> {
  const supabase = await createClient();

  if (replace) {
    // delete-everything pattern Supabase requires a filter for
    await supabase.from('atelier_llm_calls').delete().not('id', 'is', null);
  }

  const now = Date.now();
  const thirtyDaysMs = 30 * 24 * 60 * 60 * 1000;

  const rows = Array.from({ length: count }, () => {
    const agent = AGENTS[randInt(0, AGENTS.length - 1)];
    const model = MODELS[randInt(0, MODELS.length - 1)];
    const inputTokens = randInt(500, 8000);
    const outputTokens = randInt(100, 2500);
    const cost =
      (inputTokens / 1000) * model.inPer1k +
      (outputTokens / 1000) * model.outPer1k;
    const createdAt = new Date(now - rand(0, thirtyDaysMs)).toISOString();
    return {
      agent_name: agent.id,
      model: model.name,
      input_tokens: inputTokens,
      output_tokens: outputTokens,
      estimated_cost_usd: Number(cost.toFixed(4)),
      booking_id: null,
      duration_ms: randInt(400, 12000),
      created_at: createdAt,
    };
  });

  const { error } = await supabase.from('atelier_llm_calls').insert(rows);
  if (error) {
    console.error('[seed-costs] insert failed', error.message);
    return { inserted: 0 };
  }
  return { inserted: rows.length };
}
