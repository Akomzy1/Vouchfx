"use client";

import type { PerfMetrics } from "@vouchfx/core";
import EquityCurve from "./EquityCurve";
import { signed, pct, profitFactorText, toneClass } from "./format";
import { TrendingUp, Activity } from "lucide-react";

interface Props {
  metrics: PerfMetrics | null;
  series: Array<{ day: string; cumulative: number }>;
  loading: boolean;
}

function Stat({ label, value, tone = "ink" }: { label: string; value: string; tone?: "ink" | "profit" | "loss" }) {
  const color = tone === "profit" ? "text-profit" : tone === "loss" ? "text-loss" : "text-text-primary";
  return (
    <div className="flex flex-col rounded-xl border border-border bg-surface p-3">
      <span className="text-[10px] font-medium uppercase tracking-wide text-text-muted">{label}</span>
      <span className={`num mt-1.5 text-[17px] font-bold leading-none tabular-nums ${color}`}>{value}</span>
    </div>
  );
}

export default function MetricsPanel({ metrics, series, loading }: Props) {
  const m = metrics;
  const netTone = m ? (m.netPnl > 0 ? "profit" : m.netPnl < 0 ? "loss" : "ink") : "ink";
  const dash = "—";

  return (
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-[1fr_1.3fr]">
      {/* Stat grid */}
      <section className="rounded-2xl border border-border bg-surface p-4">
        <div className="mb-3 flex items-center gap-2">
          <TrendingUp size={16} className="text-primary-light" />
          <h2 className="text-[14px] font-semibold text-text-primary">Metrics</h2>
        </div>
        <div className={`grid grid-cols-2 gap-2.5 sm:grid-cols-4 lg:grid-cols-2 ${loading ? "opacity-50" : ""}`}>
          <Stat label="Net P&L" value={m ? signed(m.netPnl) : dash} tone={netTone as "ink" | "profit" | "loss"} />
          <Stat label="Profit factor" value={m ? profitFactorText(m.profitFactor) : dash} />
          <Stat label="Trade win %" value={m ? pct(m.tradeWinPct) : dash} />
          <Stat label="Day win %" value={m ? pct(m.dayWinPct) : dash} />
          <Stat label="Avg win" value={m ? signed(m.avgWin) : dash} tone="profit" />
          <Stat label="Avg loss" value={m ? signed(m.avgLoss) : dash} tone="loss" />
          <Stat label="Total trades" value={m ? String(m.totalTrades) : dash} />
          <Stat label="Avg trades/day" value={m ? m.avgTradesPerDay.toFixed(1) : dash} />
        </div>
      </section>

      {/* Equity curve */}
      <section className="rounded-2xl border border-border bg-surface p-4">
        <div className="mb-1 flex items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <Activity size={16} className="text-primary-light" />
            <h2 className="text-[14px] font-semibold text-text-primary">Cumulative P&amp;L</h2>
          </div>
          {m && (
            <span className={`num text-[13px] font-semibold tabular-nums ${toneClass(m.netPnl)}`}>
              {signed(m.netPnl)}
            </span>
          )}
        </div>
        <EquityCurve data={series} />
      </section>
    </div>
  );
}
