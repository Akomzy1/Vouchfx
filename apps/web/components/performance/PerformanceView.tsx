"use client";

import { useEffect, useMemo, useState } from "react";
import type { PerfMetrics, ChannelRow } from "@vouchfx/core";
import PnlCalendar, { type CalendarDay } from "./PnlCalendar";
import MetricsPanel from "./MetricsPanel";
import ChannelTable from "./ChannelTable";
import DayDrawer, { type DayTrade } from "./DayDrawer";

export interface AccountOpt {
  id: string;
  label: string | null;
  accountMode: "demo" | "live" | null;
}

type Range = "month" | "30d" | "90d" | "all";
const RANGES: Array<{ key: Range; label: string }> = [
  { key: "month", label: "This month" },
  { key: "30d", label: "30D" },
  { key: "90d", label: "90D" },
  { key: "all", label: "All" },
];

const pad = (n: number) => String(n).padStart(2, "0");
const ymd = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const addDays = (d: Date, n: number) => new Date(d.getFullYear(), d.getMonth(), d.getDate() + n);

interface ScopeOpt {
  id: string;
  label: string;
  badge?: "demo" | "live";
  broker: string | null;
  mode: "demo" | "live" | null;
}

function buildOptions(accounts: AccountOpt[]): ScopeOpt[] {
  const live = accounts.filter((a) => a.accountMode === "live");
  const demo = accounts.filter((a) => a.accountMode === "demo");
  const opts: ScopeOpt[] = [];
  if (live.length > 1) opts.push({ id: "all-live", label: "All live accounts", badge: "live", broker: null, mode: "live" });
  if (demo.length > 1) opts.push({ id: "all-demo", label: "All demo accounts", badge: "demo", broker: null, mode: "demo" });
  for (const a of accounts) {
    opts.push({ id: a.id, label: a.label ?? "MT5 account", badge: a.accountMode ?? undefined, broker: a.id, mode: null });
  }
  if (opts.length === 0) opts.push({ id: "all-live", label: "All accounts", broker: null, mode: "live" });
  return opts;
}

function rangeDates(range: Range, today: Date): { from: string; to: string } {
  const toExcl = ymd(addDays(today, 1));
  if (range === "month") {
    return {
      from: ymd(new Date(today.getFullYear(), today.getMonth(), 1)),
      to: ymd(new Date(today.getFullYear(), today.getMonth() + 1, 1)),
    };
  }
  if (range === "30d") return { from: ymd(addDays(today, -29)), to: toExcl };
  if (range === "90d") return { from: ymd(addDays(today, -89)), to: toExcl };
  return { from: "2000-01-01", to: toExcl };
}

function scopeParams(o: ScopeOpt): string {
  const p = new URLSearchParams();
  if (o.broker) p.set("broker", o.broker);
  if (o.mode) p.set("mode", o.mode);
  return p.toString();
}

export default function PerformanceView({ accounts }: { accounts: AccountOpt[] }) {
  const tz = useMemo(() => {
    try {
      return Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
    } catch {
      return "UTC";
    }
  }, []);
  const options = useMemo(() => buildOptions(accounts), [accounts]);

  const [selectedId, setSelectedId] = useState(options[0]!.id);
  const [range, setRange] = useState<Range>("30d");
  const [calMonth, setCalMonth] = useState(() => {
    const n = new Date();
    return new Date(n.getFullYear(), n.getMonth(), 1);
  });
  const [selectedDay, setSelectedDay] = useState<string | null>(null);

  const [calDays, setCalDays] = useState<CalendarDay[]>([]);
  const [calLoading, setCalLoading] = useState(true);
  const [metrics, setMetrics] = useState<PerfMetrics | null>(null);
  const [series, setSeries] = useState<Array<{ day: string; cumulative: number }>>([]);
  const [channels, setChannels] = useState<ChannelRow[]>([]);
  const [sumLoading, setSumLoading] = useState(true);
  const [dayTrades, setDayTrades] = useState<DayTrade[]>([]);
  const [dayLoading, setDayLoading] = useState(false);

  const scope = options.find((o) => o.id === selectedId) ?? options[0]!;
  const sp = scopeParams(scope);
  const monthKey = `${calMonth.getFullYear()}-${pad(calMonth.getMonth() + 1)}-01`;
  const todayKey = ymd(new Date());

  // Calendar — depends on the account scope + displayed month.
  useEffect(() => {
    const ctrl = new AbortController();
    setCalLoading(true);
    const q = new URLSearchParams(sp);
    q.set("tz", tz);
    q.set("month", monthKey);
    fetch(`/api/performance/calendar?${q.toString()}`, { signal: ctrl.signal })
      .then((r) => (r.ok ? r.json() : { days: [] }))
      .then((d) => setCalDays(d.days ?? []))
      .catch(() => {})
      .finally(() => setCalLoading(false));
    return () => ctrl.abort();
  }, [sp, monthKey, tz]);

  // Summary (metrics + equity curve + channels) — depends on scope + range.
  useEffect(() => {
    const ctrl = new AbortController();
    setSumLoading(true);
    const { from, to } = rangeDates(range, new Date());
    const q = new URLSearchParams(sp);
    q.set("tz", tz);
    q.set("from", from);
    q.set("to", to);
    fetch(`/api/performance/summary?${q.toString()}`, { signal: ctrl.signal })
      .then((r) => (r.ok ? r.json() : { metrics: null, series: [], channels: [] }))
      .then((d) => {
        setMetrics(d.metrics ?? null);
        setSeries(d.series ?? []);
        setChannels(d.channels ?? []);
      })
      .catch(() => {})
      .finally(() => setSumLoading(false));
    return () => ctrl.abort();
  }, [sp, range, tz]);

  // Day drill-down.
  useEffect(() => {
    if (!selectedDay) return;
    const ctrl = new AbortController();
    setDayLoading(true);
    setDayTrades([]);
    const q = new URLSearchParams(sp);
    q.set("tz", tz);
    q.set("day", selectedDay);
    fetch(`/api/performance/day?${q.toString()}`, { signal: ctrl.signal })
      .then((r) => (r.ok ? r.json() : { trades: [] }))
      .then((d) => setDayTrades(d.trades ?? []))
      .catch(() => {})
      .finally(() => setDayLoading(false));
    return () => ctrl.abort();
  }, [sp, selectedDay, tz]);

  return (
    <div className="space-y-4">
      {/* Controls */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-2">
          <select
            value={selectedId}
            onChange={(e) => setSelectedId(e.target.value)}
            className="num rounded-lg border border-border bg-surface px-3 py-2 text-[13px] text-text-primary focus:outline-none focus:ring-1 focus:ring-primary/50"
          >
            {options.map((o) => (
              <option key={o.id} value={o.id}>
                {o.label}
                {o.badge ? ` · ${o.badge}` : ""}
              </option>
            ))}
          </select>
          {scope.badge === "demo" && (
            <span className="pill pill-paused">
              <span className="h-1.5 w-1.5 rounded-full bg-warning" /> Demo
            </span>
          )}
        </div>

        <div className="inline-flex rounded-lg border border-border bg-surface p-0.5">
          {RANGES.map((r) => (
            <button
              key={r.key}
              onClick={() => setRange(r.key)}
              className={`rounded-md px-3 py-1.5 text-[12px] font-medium transition-colors ${
                range === r.key ? "bg-primary/15 text-primary-light" : "text-text-secondary hover:text-text-primary"
              }`}
            >
              {r.label}
            </button>
          ))}
        </div>
      </div>

      {accounts.length === 0 && (
        <div className="rounded-xl border border-primary/20 bg-surface p-4 text-[13px] text-text-secondary">
          Connect a broker to start seeing your performance. Once trades close, they appear here automatically.
        </div>
      )}

      <MetricsPanel metrics={metrics} series={series} loading={sumLoading} />

      <PnlCalendar
        month={calMonth}
        days={calDays}
        loading={calLoading}
        todayKey={todayKey}
        onPrev={() => setCalMonth((m) => new Date(m.getFullYear(), m.getMonth() - 1, 1))}
        onNext={() => setCalMonth((m) => new Date(m.getFullYear(), m.getMonth() + 1, 1))}
        onSelectDay={setSelectedDay}
      />

      <ChannelTable channels={channels} loading={sumLoading} />

      {selectedDay && (
        <DayDrawer day={selectedDay} trades={dayTrades} loading={dayLoading} onClose={() => setSelectedDay(null)} />
      )}
    </div>
  );
}
