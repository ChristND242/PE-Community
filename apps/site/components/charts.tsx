'use client';

import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { EmptyState } from './ui';

type ChartDatum = {
  label: string;
  value: number;
  tooltipLabel?: string;
};

const palette = ['#5ed29c', '#67e8f9', '#a78bfa', '#fbbf24', '#fb7185', '#93c5fd'];

function ChartTooltip({ active, payload, label }: { active?: boolean; payload?: Array<{ value: number; name?: string; payload?: ChartDatum }>; label?: string }) {
  if (!active || !payload?.length) return null;
  const item = payload[0];
  return (
    <div className="rounded-lg border border-white/10 bg-[#101815] px-3 py-2 text-xs shadow-2xl shadow-black/40">
      <p className="font-semibold text-white">{item.payload?.tooltipLabel ?? item.payload?.label ?? label ?? item.name}</p>
      <p className="mt-1 text-accent">{item.value}</p>
    </div>
  );
}

export function VerticalBarChart({ data, emptyText, height = 220 }: { data: ChartDatum[]; emptyText: string; height?: number }) {
  if (!data.some((item) => item.value > 0)) return <EmptyState text={emptyText} />;
  return (
    <div style={{ height }}>
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} margin={{ top: 8, right: 10, left: -20, bottom: 0 }}>
          <CartesianGrid stroke="rgba(255,255,255,0.08)" vertical={false} />
          <XAxis dataKey="label" tick={{ fill: 'rgba(255,255,255,0.55)', fontSize: 11 }} axisLine={false} tickLine={false} interval={0} />
          <YAxis tick={{ fill: 'rgba(255,255,255,0.45)', fontSize: 11 }} axisLine={false} tickLine={false} allowDecimals={false} />
          <Tooltip content={<ChartTooltip />} cursor={{ fill: 'rgba(255,255,255,0.04)' }} />
          <Bar dataKey="value" radius={[8, 8, 0, 0]}>
            {data.map((_, index) => (
              <Cell key={index} fill={palette[index % palette.length]} />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

export function DonutChart({ data, emptyText, compact = false }: { data: ChartDatum[]; emptyText: string; compact?: boolean }) {
  if (!data.some((item) => item.value > 0)) return <EmptyState text={emptyText} />;
  return (
    <div className={`grid min-w-0 items-center gap-4 ${compact ? 'sm:grid-cols-[minmax(140px,170px)_minmax(0,1fr)]' : 'md:grid-cols-[minmax(150px,180px)_minmax(0,1fr)]'}`}>
      <div className={`mx-auto aspect-square w-full ${compact ? 'max-w-[170px]' : 'max-w-[180px]'}`}>
        <ResponsiveContainer width="100%" height="100%">
          <PieChart>
            <Pie data={data} dataKey="value" nameKey="label" innerRadius={50} outerRadius={78} paddingAngle={3}>
              {data.map((_, index) => (
                <Cell key={index} fill={palette[index % palette.length]} />
              ))}
            </Pie>
            <Tooltip content={<ChartTooltip />} />
          </PieChart>
        </ResponsiveContainer>
      </div>
      <div className="min-w-0 space-y-3 self-center">
        {data.map((item, index) => (
          <div key={item.label} className="flex min-w-0 items-center justify-between gap-3 rounded-lg border border-white/10 bg-white/[0.03] px-3 py-2 text-sm">
            <span className="flex min-w-0 items-center gap-2 text-white/70">
              <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ backgroundColor: palette[index % palette.length] }} />
              <span className="truncate" title={item.label}>{item.label}</span>
            </span>
            <span className="shrink-0 font-bold tabular-nums text-white">{item.value}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
