"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { TrendingUp, TrendingDown, Clock } from "lucide-react";

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
          // Re-fetch on any change to this user's trades
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
      <div className="card p-8 text-center">
        <Clock size={24} className="mx-auto text-text-muted mb-2" />
        <p className="text-sm text-text-muted">No open positions.</p>
      </div>
    );
  }

  return (
    <div className="card overflow-hidden">
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border">
              {["Symbol", "Side", "Volume", "Entry", "SL", "TP", "Opened"].map((h) => (
                <th
                  key={h}
                  className="px-4 py-2.5 text-left text-xs font-medium uppercase tracking-wide text-text-secondary whitespace-nowrap"
                >
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {trades.map((t) => (
              <tr key={t.id} className="border-b border-border last:border-0 hover:bg-surface-elevated/40 transition-colors">
                <td className="num px-4 py-2.5 font-semibold text-text-primary whitespace-nowrap">
                  {t.symbol}
                </td>
                <td className="px-4 py-2.5">
                  <span className={`inline-flex items-center gap-1 text-xs font-semibold ${t.side === "BUY" ? "text-profit" : "text-loss"}`}>
                    {t.side === "BUY" ? <TrendingUp size={12} /> : <TrendingDown size={12} />}
                    {t.side}
                  </span>
                </td>
                <td className="num px-4 py-2.5 text-text-secondary">{t.volume}</td>
                <td className="num px-4 py-2.5 text-text-secondary">
                  {t.entry_price != null ? t.entry_price.toFixed(5) : "—"}
                </td>
                <td className="num px-4 py-2.5 text-text-muted">
                  {t.sl != null ? t.sl.toFixed(5) : "—"}
                </td>
                <td className="num px-4 py-2.5 text-text-muted">
                  {t.tp != null ? t.tp.toFixed(5) : "—"}
                </td>
                <td className="px-4 py-2.5 text-text-muted text-xs whitespace-nowrap">
                  {t.opened_at ? timeAgo(t.opened_at) : t.status === "PENDING" ? "pending" : "—"}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
