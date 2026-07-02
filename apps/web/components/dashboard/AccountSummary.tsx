"use client";

import { useState } from "react";
import { Wallet, TrendingUp, ArrowUpRight, Activity, Layers, Zap, Lock } from "lucide-react";
import EquitySparkline from "./EquitySparkline";

export interface ModeAggregate {
  /** Sum of cached balance across this mode's copy-enabled accounts (null if none synced). */
  balance: number | null;
  equity: number | null;
  /** equity − balance (null if either is null). */
  floating: number | null;
  /** Sum of today's realised P&L (only accounts whose cache is dated today). */
  todayPnl: number;
  accountCount: number;
}

interface Props {
  live: ModeAggregate | null;
  demo: ModeAggregate | null;
  /** Open trades across ALL copy-enabled accounts (a count — safe to combine modes). */
  openCount: number;
  brokerOk: boolean;
  sparklineData: { time: string; balance: number }[];
  signalsTodayCount: number;
  signalDailyLimit: number;
}

type Tone = "ink" | "profit" | "loss" | "teal";

function fmtCcy(n: number | null): string {
  if (n == null) return "—";
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(n);
}
function fmtSigned(n: number): string {
  const s = n < 0 ? "−" : "+";
  return `${s}$${Math.abs(n).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function StatCard({
  label, icon: Icon, value, tone = "ink", sub, children, span,
}: {
  label: string; icon: React.ElementType; value: React.ReactNode; tone?: Tone; sub?: React.ReactNode; children?: React.ReactNode; span?: string;
}) {
  const valueColor = { ink: "text-text-primary", profit: "text-profit", loss: "text-loss", teal: "text-primary-light" }[tone];
  return (
    <div className={`flex flex-col rounded-2xl border border-border bg-surface p-4 ${span ?? ""}`}>
      <div className="flex items-center justify-between">
        <span className="text-[11px] font-medium uppercase tracking-wide text-text-muted">{label}</span>
        <Icon size={15} className="text-text-muted" />
      </div>
      <div className={`num mt-2 text-[22px] font-bold leading-none ${valueColor}`}>{value}</div>
      {sub && <div className="mt-1.5 text-[12px] text-text-secondary">{sub}</div>}
      {children}
    </div>
  );
}

export default function AccountSummary({
  live, demo, openCount, brokerOk, sparklineData, signalsTodayCount, signalDailyLimit,
}: Props) {
  const hasLive = !!live && live.accountCount > 0;
  const hasDemo = !!demo && demo.accountCount > 0;
  const [mode, setMode] = useState<"live" | "demo">(hasLive ? "live" : "demo");

  const agg = (mode === "live" ? live : demo) ?? { balance: null, equity: null, floating: null, todayPnl: 0, accountCount: 0 };
  const bothModes = hasLive && hasDemo;

  const pnlTone: Tone = agg.floating == null ? "ink" : agg.floating >= 0 ? "profit" : "loss";
  const todayTone: Tone = agg.todayPnl > 0 ? "profit" : agg.todayPnl < 0 ? "loss" : "ink";
  const acctNote = `${agg.accountCount} ${mode} account${agg.accountCount !== 1 ? "s" : ""} copying`;
  const limitPct = signalDailyLimit > 0 ? Math.min(100, Math.round((signalsTodayCount / signalDailyLimit) * 100)) : 0;

  return (
    <div>
      {/* Mode toggle — only when the trader copies to BOTH demo and live. Money is
          never blended across modes; counts (open trades) are totals. */}
      {bothModes && (
        <div className="mb-3 flex items-center gap-2">
          <div className="inline-flex rounded-lg border border-border bg-surface p-0.5">
            {(["live", "demo"] as const).map((m) => (
              <button
                key={m}
                onClick={() => setMode(m)}
                className={`rounded-md px-3 py-1 text-[12px] font-medium capitalize transition-colors ${
                  mode === m ? "bg-primary/15 text-primary-light" : "text-text-secondary hover:text-text-primary"
                }`}
              >
                {m}
              </button>
            ))}
          </div>
          <span className="text-[11px] text-text-muted">Balance &amp; P&amp;L shown per account type</span>
        </div>
      )}

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-6">
        <StatCard label="Account balance" icon={Wallet} value={fmtCcy(agg.balance)}
          sub={<span className="flex items-center gap-1 text-text-muted"><Lock size={11} /> {acctNote}</span>} />

        <StatCard label="Equity" icon={TrendingUp} value={fmtCcy(agg.equity)} span="col-span-2 sm:col-span-1">
          <div className="mt-2 h-[42px] w-full">
            <EquitySparkline data={sparklineData} currency="USD" />
          </div>
        </StatCard>

        <StatCard label="Today's P&L" icon={ArrowUpRight} value={fmtSigned(agg.todayPnl)} tone={todayTone}
          sub={<span className="flex items-center gap-1 text-text-muted"><Lock size={11} /> Realized today</span>} />

        <StatCard label="Floating P&L" icon={Activity} value={agg.floating != null ? fmtSigned(agg.floating) : "—"} tone={pnlTone}
          sub={agg.floating != null
            ? <span className={agg.floating >= 0 ? "text-profit" : "text-loss"}>Unrealized · {openCount} open</span>
            : "Unrealized"} />

        <StatCard label="Open trades" icon={Layers} value={String(openCount)}
          sub={<span className="flex items-center gap-1 text-text-muted">
            <span className={`h-1.5 w-1.5 rounded-full ${brokerOk ? "live-dot bg-profit" : "bg-loss"}`} />
            {brokerOk ? "All copying accounts" : "Queued"}
          </span>} />

        <StatCard label="Signals today" icon={Zap} tone="teal"
          value={signalDailyLimit > 0
            ? <span>{signalsTodayCount} <span className="text-base text-text-muted">/ {signalDailyLimit}</span></span>
            : String(signalsTodayCount)}>
          {signalDailyLimit > 0 && (
            <div className="mt-3">
              <div className="h-1.5 w-full overflow-hidden rounded-full bg-surface-elevated">
                <div className="h-full rounded-full bg-primary" style={{ width: `${limitPct}%` }} />
              </div>
              <div className="mt-1.5 text-[12px] text-text-secondary">
                {Math.max(0, signalDailyLimit - signalsTodayCount)} left today
              </div>
            </div>
          )}
        </StatCard>
      </div>
    </div>
  );
}
