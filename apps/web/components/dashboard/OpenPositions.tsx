"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { ArrowUpRight, ArrowDownRight, Clock } from "lucide-react";

interface Trade {
  id: string;
  broker_connection_id: string;
  symbol: string;
  side: "BUY" | "SELL";
  volume: number;
  entry_price: number | null;
  sl: number | null;
  tp: number | null;
  status: string;
  opened_at: string | null;
  created_at: string;
}

interface Props {
  initialTrades: Trade[];
  userId: string;
  /** Copy-enabled account ids to scope to; null = show all accounts. */
  accountIds: string[] | null;
  /** broker_connection_id → { label, mode } for the Account column. */
  accounts: Record<string, { label: string; mode: "demo" | "live" | null }>;
}

function timeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const m = Math.floor(diff / 60_000);
  if (m < 1) return "just now";
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}

function fmtPrice(n: number | null): string {
  if (n == null) return "—";
  return n.toFixed(n >= 100 ? 2 : 5);
}

function AccountTag({ acct }: { acct?: { label: string; mode: "demo" | "live" | null } }) {
  if (!acct) return <span className="text-text-muted">—</span>;
  return (
    <span className="inline-flex items-center gap-1.5">
      <span className="max-w-[120px] truncate text-[12px] text-text-secondary">{acct.label}</span>
      {acct.mode && (
        <span
          className={`rounded px-1 py-0.5 text-[9px] font-bold uppercase ${
            acct.mode === "live" ? "bg-profit/10 text-profit" : "bg-warning/10 text-warning"
          }`}
        >
          {acct.mode}
        </span>
      )}
    </span>
  );
}

function SideTag({ side }: { side: "BUY" | "SELL" }) {
  const buy = side === "BUY";
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-md border px-1.5 py-0.5 text-[11px] font-semibold ${
        buy
          ? "border-primary/30 bg-primary/10 text-primary-light"
          : "border-border bg-surface-elevated text-text-secondary"
      }`}
    >
      {buy ? <ArrowUpRight size={11} strokeWidth={2.5} /> : <ArrowDownRight size={11} strokeWidth={2.5} />}
      {side}
    </span>
  );
}

export default function OpenPositions({ initialTrades, userId, accountIds, accounts }: Props) {
  const [trades, setTrades] = useState<Trade[]>(initialTrades);
  // Stable key so the effect doesn't re-subscribe on every render.
  const accountKey = accountIds ? accountIds.join(",") : "*";

  useEffect(() => {
    const supabase = createClient();
    const scope = accountKey === "*" ? null : accountKey.split(",");

    const channel = supabase
      .channel("open-positions")
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "trades",
          filter: `user_id=eq.${userId}`,
        },
        () => {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          let q = (supabase as any)
            .from("trades")
            .select("id, broker_connection_id, symbol, side, volume, entry_price, sl, tp, status, opened_at, created_at")
            .eq("user_id", userId)
            .in("status", ["OPEN", "PENDING"]);
          if (scope) q = q.in("broker_connection_id", scope);
          q.order("created_at", { ascending: false })
            .limit(20)
            .then(({ data }: { data: Trade[] | null }) => {
              if (data) setTrades(data);
            });
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [userId, accountKey]);

  if (trades.length === 0) {
    return (
      <div className="p-8 text-center">
        <Clock size={24} className="mx-auto text-text-muted mb-2" />
        <p className="text-sm text-text-muted">No open positions.</p>
      </div>
    );
  }

  const totalLots = trades.reduce((a, t) => a + (t.volume ?? 0), 0);
  const showAccount = Object.keys(accounts).length > 1;
  const H = "px-3 py-2.5 text-left text-[11px] font-semibold uppercase tracking-wide text-text-muted";
  const C = "px-3 py-3 text-sm";

  return (
    <>
      <div className="overflow-x-auto scroll-thin">
        <table className="w-full min-w-[640px] border-collapse">
          <thead>
            <tr className="border-b border-border">
              <th className={H}>Symbol</th>
              {showAccount && <th className={H}>Account</th>}
              <th className={H}>Side</th>
              <th className={`${H} text-right`}>Lots</th>
              <th className={`${H} text-right`}>Entry</th>
              <th className={`${H} text-right`}>SL</th>
              <th className={`${H} text-right`}>TP</th>
              <th className={`${H} text-right`}>Opened</th>
            </tr>
          </thead>
          <tbody>
            {trades.map((t) => (
              <tr
                key={t.id}
                className="border-b border-border/50 transition-colors last:border-0 hover:bg-surface-elevated/40"
              >
                <td className={`${C} font-semibold text-text-primary`}>{t.symbol}</td>
                {showAccount && (
                  <td className={C}>
                    <AccountTag acct={accounts[t.broker_connection_id]} />
                  </td>
                )}
                <td className={C}>
                  <SideTag side={t.side} />
                </td>
                <td className={`${C} num text-right text-text-secondary`}>{t.volume?.toFixed(2) ?? "—"}</td>
                <td className={`${C} num text-right text-text-primary`}>{fmtPrice(t.entry_price)}</td>
                <td className={`${C} num text-right text-text-muted`}>{fmtPrice(t.sl)}</td>
                <td className={`${C} num text-right text-text-muted`}>{fmtPrice(t.tp)}</td>
                <td className={`${C} num text-right text-[12px] text-text-muted whitespace-nowrap`}>
                  {t.opened_at ? timeAgo(t.opened_at) : t.status === "PENDING" ? "pending" : "—"}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="mt-3 flex items-center justify-between border-t border-border/50 px-1 pt-3 text-[12px]">
        <span className="text-text-muted">
          {trades.length} open · {totalLots.toFixed(2)} lots total exposure
        </span>
      </div>
    </>
  );
}
