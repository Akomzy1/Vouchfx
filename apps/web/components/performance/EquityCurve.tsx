"use client";

import {
  ResponsiveContainer,
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  ReferenceLine,
} from "recharts";
import { signed } from "./format";

interface Point {
  day: string; // YYYY-MM-DD
  cumulative: number;
}

const TEAL = "#2DD4BF";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function CustomTooltip({ active, payload }: any) {
  if (!active || !payload?.length) return null;
  const p = payload[0].payload as Point;
  const v = payload[0].value as number;
  return (
    <div className="rounded-md border border-border bg-surface-elevated px-2 py-1 shadow-lg">
      <p className={`num text-[11px] font-semibold tabular-nums ${v >= 0 ? "text-profit" : "text-loss"}`}>
        {signed(v)}
      </p>
      <p className="text-2xs text-text-muted">{p.day}</p>
    </div>
  );
}

export default function EquityCurve({ data }: { data: Point[] }) {
  if (data.length === 0) {
    return (
      <div className="flex h-full min-h-[180px] items-center justify-center">
        <p className="text-xs text-text-muted">No closed trades in this range</p>
      </div>
    );
  }
  return (
    <div className="h-[200px] w-full">
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={data} margin={{ top: 8, right: 8, bottom: 4, left: 4 }}>
          <ReferenceLine y={0} stroke="#222B36" strokeWidth={1} />
          <XAxis
            dataKey="day"
            tick={{ fill: "#5B6772", fontSize: 10 }}
            tickFormatter={(d: string) => d.slice(5)}
            minTickGap={28}
            axisLine={{ stroke: "#222B36" }}
            tickLine={false}
          />
          <YAxis
            tick={{ fill: "#5B6772", fontSize: 10 }}
            tickFormatter={(v: number) => (Math.abs(v) >= 1000 ? `${(v / 1000).toFixed(0)}k` : String(v))}
            width={34}
            axisLine={false}
            tickLine={false}
          />
          <Tooltip content={<CustomTooltip />} />
          <Line
            type="monotone"
            dataKey="cumulative"
            stroke={TEAL}
            strokeWidth={1.8}
            dot={false}
            activeDot={{ r: 3, fill: TEAL, stroke: "#0B0F14", strokeWidth: 2 }}
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
