"use client";

import { useState } from "react";
import { ArrowUpDown, ArrowUp, ArrowDown, Radio } from "lucide-react";
import type { ChannelRow } from "@vouchfx/core";
import { signed, pct, profitFactorText, toneClass } from "./format";

type SortKey = "channel" | "netPnl" | "winPct" | "totalTrades" | "avgWin" | "avgLoss" | "profitFactor";

const COLUMNS: Array<{ key: SortKey; label: string; numeric: boolean }> = [
  { key: "channel", label: "Channel", numeric: false },
  { key: "netPnl", label: "Net P&L", numeric: true },
  { key: "winPct", label: "Win %", numeric: true },
  { key: "totalTrades", label: "Trades", numeric: true },
  { key: "avgWin", label: "Avg win", numeric: true },
  { key: "avgLoss", label: "Avg loss", numeric: true },
  { key: "profitFactor", label: "Profit factor", numeric: true },
];

function sortValue(row: ChannelRow, key: SortKey): number | string {
  switch (key) {
    case "channel":
      return row.channel.toLowerCase();
    case "profitFactor":
      return row.profitFactor === null ? Number.POSITIVE_INFINITY : row.profitFactor;
    case "netPnl":
      return row.netPnl;
    case "winPct":
      return row.winPct;
    case "totalTrades":
      return row.totalTrades;
    case "avgWin":
      return row.avgWin;
    case "avgLoss":
      return row.avgLoss;
  }
}

export default function ChannelTable({ channels, loading }: { channels: ChannelRow[]; loading: boolean }) {
  const [sortKey, setSortKey] = useState<SortKey>("netPnl");
  const [dir, setDir] = useState<"asc" | "desc">("desc");

  const sorted = [...channels].sort((a, b) => {
    const av = sortValue(a, sortKey);
    const bv = sortValue(b, sortKey);
    let cmp: number;
    if (typeof av === "string" || typeof bv === "string") cmp = String(av).localeCompare(String(bv));
    else cmp = av - bv;
    return dir === "asc" ? cmp : -cmp;
  });

  function toggle(key: SortKey) {
    if (key === sortKey) setDir((d) => (d === "asc" ? "desc" : "asc"));
    else {
      setSortKey(key);
      setDir(key === "channel" ? "asc" : "desc");
    }
  }

  return (
    <section className="rounded-2xl border border-border bg-surface">
      <div className="flex items-center gap-2 border-b border-border px-4 py-3.5">
        <Radio size={16} className="text-primary-light" />
        <h2 className="text-[14px] font-semibold text-text-primary">Performance by channel</h2>
      </div>
      <div className="overflow-x-auto">
        <table className={`w-full text-sm ${loading ? "opacity-50" : ""}`}>
          <thead>
            <tr className="border-b border-border">
              {COLUMNS.map((col) => {
                const active = col.key === sortKey;
                const Icon = active ? (dir === "asc" ? ArrowUp : ArrowDown) : ArrowUpDown;
                return (
                  <th
                    key={col.key}
                    className={`px-4 py-3 text-xs font-medium uppercase tracking-wide text-text-secondary ${col.numeric ? "text-right" : "text-left"}`}
                  >
                    <button
                      onClick={() => toggle(col.key)}
                      className={`inline-flex items-center gap-1 transition-colors hover:text-text-primary ${col.numeric ? "flex-row-reverse" : ""} ${active ? "text-text-primary" : ""}`}
                    >
                      <Icon size={12} className={active ? "text-primary-light" : "text-text-muted"} />
                      {col.label}
                    </button>
                  </th>
                );
              })}
            </tr>
          </thead>
          <tbody>
            {sorted.length === 0 ? (
              <tr>
                <td colSpan={COLUMNS.length} className="px-4 py-8 text-center text-sm text-text-muted">
                  No closed trades in this range.
                </td>
              </tr>
            ) : (
              sorted.map((row) => (
                <tr key={row.sourceId} className="border-b border-border last:border-0 hover:bg-surface-elevated">
                  <td className="px-4 py-3 font-medium text-text-primary">{row.channel}</td>
                  <td className={`num px-4 py-3 text-right font-semibold tabular-nums ${toneClass(row.netPnl)}`}>{signed(row.netPnl)}</td>
                  <td className="num px-4 py-3 text-right tabular-nums text-text-secondary">{pct(row.winPct)}</td>
                  <td className="num px-4 py-3 text-right tabular-nums text-text-secondary">{row.totalTrades}</td>
                  <td className="num px-4 py-3 text-right tabular-nums text-profit">{signed(row.avgWin)}</td>
                  <td className="num px-4 py-3 text-right tabular-nums text-loss">{signed(row.avgLoss)}</td>
                  <td className="num px-4 py-3 text-right tabular-nums text-text-secondary">{profitFactorText(row.profitFactor)}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </section>
  );
}
