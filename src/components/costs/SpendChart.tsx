'use client';

import {
  ResponsiveContainer,
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
} from 'recharts';
import type { DailySpend } from '@/lib/utils/llm-costs';
import { USD_TO_AUD, PALETTE } from '@/lib/utils/constants';

type Props = { data: DailySpend[] };

/**
 * Spend-over-time line chart. Recharts forwards `stroke` and `style`
 * onto SVG elements; CSS custom properties (e.g. `var(--p-border)`)
 * resolve correctly in those positions, so this chart re-themes
 * automatically with the rest of the app.
 */
export default function SpendChart({ data }: Props) {
  const chartData = data.map((d) => ({
    date: d.date.slice(5), // MM-DD
    aud: Number((d.totalUsd * USD_TO_AUD).toFixed(2)),
  }));

  return (
    <ResponsiveContainer width="100%" height={240}>
      <LineChart data={chartData} margin={{ top: 8, right: 8, bottom: 8, left: 0 }}>
        <CartesianGrid strokeDasharray="3 3" stroke={PALETTE.border} vertical={false} />
        <XAxis
          dataKey="date"
          stroke={PALETTE.muted}
          fontSize={11}
          tickLine={false}
          axisLine={{ stroke: PALETTE.border }}
        />
        <YAxis
          stroke={PALETTE.muted}
          fontSize={11}
          tickLine={false}
          axisLine={{ stroke: PALETTE.border }}
          tickFormatter={(v) => `A$${v}`}
        />
        <Tooltip
          contentStyle={{ background: PALETTE.bg, border: `1px solid ${PALETTE.border}`, borderRadius: 6, fontSize: 12 }}
          labelStyle={{ color: PALETTE.muted }}
          itemStyle={{ color: PALETTE.text }}
          formatter={(value) => [`A$${Number(value).toFixed(2)}`, 'Spend']}
        />
        <Line
          type="monotone"
          dataKey="aud"
          stroke={PALETTE.accent}
          strokeWidth={2}
          dot={{ r: 2, fill: PALETTE.accent }}
          activeDot={{ r: 4 }}
        />
      </LineChart>
    </ResponsiveContainer>
  );
}
