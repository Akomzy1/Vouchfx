"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { ArrowUpRight, ArrowDownRight, Clock } from "lucide-react";

interface Trade {
  id: string;
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

export default function OpenPositions({ initialTrades, userId }: Props) {
  const [trades, setTrades] = useState<Trade[]>(initialTrades);

  useEffect(() => {
    const supabase = createClient();

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
          (supabase as any)
            .from("trades")
            .select("id, symbol, side, volume, entry_price, sl, tp, status, opened_at, created_at")
            .eq("user_id", userId)
            .in("status", ["OPEN", "PENDING"])
            .order("created_at", { ascending: false })
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
  }, [userId]);

  if (trades.length === 0) {
    return (
      <div className="p-8 text-center">
        <Clock size={24} className="mx-auto text-text-muted mb-2" />
        <p className="text-sm text-text-muted">No open positions.</p>
      </div>
    );
  }

  const totalLots = trades.reduce((a, t) => a + (t.volume ?? 0), 0);
  const H = "px-3 py-2.5 text-left text-[11px] font-semibold uppercase tracking-wide text-text-muted";
  const C = "px-3 py-3 text-sm";

  return (
    <>
      <div className="overflow-x-auto scroll-thin">
        <table className="w-full min-w-[640px] border-collapse">
          <thead>
            <tr className="border-b border-border">
              <th className={H}>Symbol</th>
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
