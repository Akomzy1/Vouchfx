"use client";

import Link from "next/link";
import { X, ArrowRight } from "lucide-react";
import { signed, lots, price, toneClass } from "./format";

export interface DayTrade {
  tradeId: string;
  signalId: string;
  symbol: string;
  side: string;
  volume: number;
  entryPrice: number | null;
  exitPrice: number | null;
  pnl: number;
  channel: string;
  closedAt: string;
}

interface Props {
  day: string;
  trades: DayTrade[];
  loading: boolean;
  onClose: () => void;
}

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

function prettyDay(day: string): string {
  const [y, m, d] = day.split("-").map(Number);
  return `${d} ${MONTHS[(m ?? 1) - 1]} ${y}`;
}

export default function DayDrawer({ day, trades, loading, onClose }: Props) {
  const net = trades.reduce((s, t) => s + t.pnl, 0);

  return (
    <div className="fixed inset-0 z-40">
      <div className="anim-overlay absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />
      <div className="anim-fade absolute inset-y-0 right-0 flex w-full max-w-md flex-col border-l border-border bg-bg shadow-2xl">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-border px-5 py-4">
          <div>
            <h2 className="text-[15px] font-semibold text-text-primary">{prettyDay(day)}</h2>
            <p className="num mt-0.5 text-[12px] tabular-nums text-text-secondary">
              {trades.length} trade{trades.length !== 1 ? "s" : ""} ·{" "}
              <span className={toneClass(net)}>{signed(net)}</span>
            </p>
          </div>
          <button onClick={onClose} className="rounded-lg p-1.5 text-text-muted hover:bg-surface hover:text-text-primary" aria-label="Close">
            <X size={18} />
          </button>
        </div>

        {/* Trades */}
        <div className="scroll-thin flex-1 overflow-y-auto p-3">
          {loading ? (
            <p className="px-2 py-6 text-center text-sm text-text-muted">Loading…</p>
          ) : trades.length === 0 ? (
            <p className="px-2 py-6 text-center text-sm text-text-muted">No trades closed on this day.</p>
          ) : (
            <ul className="space-y-2">
              {trades.map((t) => (
                <li key={t.tradeId}>
                  <Link
                    href={`/signals/${t.signalId}`}
                    className="group flex flex-col gap-1.5 rounded-xl border border-border bg-surface p-3 transition-colors hover:border-primary/40"
                  >
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex items-center gap-2">
                        <span className="num text-[13px] font-semibold text-text-primary">{t.symbol}</span>
                        <span className={`text-[11px] font-medium uppercase ${t.side === "BUY" ? "text-profit" : "text-loss"}`}>
                          {t.side}
                        </span>
                        <span className="num text-[11px] tabular-nums text-text-muted">{lots(t.volume)} lots</span>
                      </div>
                      <span className={`num text-[13px] font-bold tabular-nums ${toneClass(t.pnl)}`}>{signed(t.pnl)}</span>
                    </div>
                    <div className="flex items-center justify-between gap-2">
                      <span className="num text-[11px] tabular-nums text-text-muted">
                        {price(t.entryPrice)} → {price(t.exitPrice)}
                      </span>
                      <span className="flex items-center gap-1 text-[11px] text-text-secondary">
                        {t.channel}
                        <ArrowRight size={11} className="text-text-muted transition-transform group-hover:translate-x-0.5" />
                      </span>
                    </div>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
}
