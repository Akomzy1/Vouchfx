"use client";

import {
  ResponsiveContainer,
  AreaChart,
  Area,
  Tooltip,
  YAxis,
} from "recharts";

interface DataPoint {
  time: string;
  balance: number;
}

interface Props {
  data: DataPoint[];
  currency: string;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function CustomTooltip({ active, payload }: any) {
  if (!active || !payload?.length) return null;
  const point = payload[0].payload as DataPoint;
  return (
    <div className="rounded-md border border-border bg-surface-elevated px-1.5 py-0.5 shadow-lg">
      <p className="num text-[10px] font-semibold text-text-primary tabular-nums">
        ${payload[0].value.toLocaleString("en-US", { minimumFractionDigits: 2 })}
      </p>
      <p className="text-2xs text-text-muted">
        {new Date(point.time).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
      </p>
    </div>
  );
}

const TEAL = "#2DD4BF";

export default function EquitySparkline({ data }: Props) {
  if (data.length === 0) {
    return (
      <div className="flex h-full items-center justify-center">
        <p className="text-xs text-text-muted">No data yet</p>
      </div>
    );
  }

  const values = data.map((d) => d.balance);
  const min = Math.min(...values);
  const max = Math.max(...values);
  const domain: [number, number] = [min * 0.999, max * 1.001];

  return (
    <div className="w-full h-full flex flex-col">
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={data} margin={{ top: 4, right: 4, bottom: 4, left: 4 }}>
          <defs>
            <linearGradient id="equity-spark" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={TEAL} stopOpacity={0.3} />
              <stop offset="100%" stopColor={TEAL} stopOpacity={0} />
            </linearGradient>
          </defs>
          <YAxis domain={domain} hide />
          <Tooltip content={<CustomTooltip />} />
          <Area
            type="monotone"
            dataKey="balance"
            stroke={TEAL}
            strokeWidth={1.6}
            fill="url(#equity-spark)"
            dot={false}
            activeDot={{ r: 3, fill: TEAL, stroke: "#0B0F14", strokeWidth: 2 }}
          />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}
