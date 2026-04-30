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
import { USD_TO_AUD } from '@/lib/utils/constants';

type Props = { data: DailySpend[] };

export default function SpendChart({ data }: Props) {
  const chartData = data.map((d) => ({
    date: d.date.slice(5), // MM-DD
    aud: Number((d.totalUsd * USD_TO_AUD).toFixed(2)),
  }));

  return (
    <ResponsiveContainer width="100%" height={240}>
      <LineChart data={chartData} margin={{ top: 8, right: 8, bottom: 8, left: 0 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="#2e3347" vertical={false} />
        <XAxis
          dataKey="date"
          stroke="#6b7186"
          fontSize={11}
          tickLine={false}
          axisLine={{ stroke: '#2e3347' }}
        />
        <YAxis
          stroke="#6b7186"
          fontSize={11}
          tickLine={false}
          axisLine={{ stroke: '#2e3347' }}
          tickFormatter={(v) => `A$${v}`}
        />
        <Tooltip
          contentStyle={{ background: '#0f1117', border: '1px solid #2e3347', borderRadius: 6, fontSize: 12 }}
          labelStyle={{ color: '#9aa0b4' }}
          itemStyle={{ color: '#e8eaed' }}
          formatter={(value) => [`A$${Number(value).toFixed(2)}`, 'Spend']}
        />
        <Line
          type="monotone"
          dataKey="aud"
          stroke="#6c8aff"
          strokeWidth={2}
          dot={{ r: 2, fill: '#6c8aff' }}
          activeDot={{ r: 4 }}
        />
      </LineChart>
    </ResponsiveContainer>
  );
}
