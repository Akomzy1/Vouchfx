"use client";

import {
  ResponsiveContainer,
  LineChart,
  Line,
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

function formatCcy(n: number, currency: string): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency,
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(n);
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function CustomTooltip({ active, payload }: any) {
  if (!active || !payload?.length) return null;
  const point = payload[0].payload as DataPoint;
  return (
    <div className="rounded-sm border border-border bg-surface-elevated px-2.5 py-1.5 shadow-lg">
      <p className="num text-xs font-semibold text-text-primary tabular-nums">
        {payload[0].value.toLocaleString("en-US", { minimumFractionDigits: 2 })}
      </p>
      <p className="text-2xs text-text-muted">
        {new Date(point.time).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
      </p>
    </div>
  );
}

export default function EquitySparkline({ data, currency }: Props) {
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
  const isFlat = min === max;
  const trend = data.length > 1 ? data[data.length - 1]!.balance - data[0]!.balance : 0;
  const trendColor = isFlat ? "#8B98A5" : trend >= 0 ? "#22C55E" : "#EF4444";

  return (
    <div className="w-full h-full flex flex-col">
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={data} margin={{ top: 4, right: 4, bottom: 4, left: 4 }}>
          <YAxis domain={domain} hide />
          <Tooltip content={<CustomTooltip />} />
          <Line
            type="monotone"
            dataKey="balance"
            stroke={trendColor}
            strokeWidth={1.5}
            dot={false}
            activeDot={{ r: 3, fill: trendColor, strokeWidth: 0 }}
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
