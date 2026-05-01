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
        <CartesianGrid strokeDasharray="3 3" stroke="#262626" vertical={false} />
        <XAxis
          dataKey="date"
          stroke="#6b6b6b"
          fontSize={11}
          tickLine={false}
          axisLine={{ stroke: '#262626' }}
        />
        <YAxis
          stroke="#6b6b6b"
          fontSize={11}
          tickLine={false}
          axisLine={{ stroke: '#262626' }}
          tickFormatter={(v) => `A$${v}`}
        />
        <Tooltip
          contentStyle={{ background: '#0a0a0a', border: '1px solid #262626', borderRadius: 6, fontSize: 12 }}
          labelStyle={{ color: '#8b8b8b' }}
          itemStyle={{ color: '#ededed' }}
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
