import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import Link from "next/link";
import { ArrowRight, TrendingUp, TrendingDown, Minus, FlaskConical } from "lucide-react";
import type { Metadata } from "next";

export const metadata: Metadata = { title: "Signals" };
export const dynamic = "force-dynamic";

function tsShort(iso: string) {
  const d = new Date(iso);
  return d.toLocaleString([], {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function confidenceColor(v: number) {
  const pct = Math.round(v * 100);
  return pct >= 85 ? "text-profit" : pct >= 70 ? "text-warning" : "text-loss";
}

function outcomeLabel(_followUpType: string | null, trades: { parsed_signal_id: string; status: string; is_simulated: boolean }[], signalId: string) {
  const legs = trades.filter((t) => t.parsed_signal_id === signalId);
  if (legs.length === 0) return { label: "Skipped", cls: "text-text-muted", simulated: false };
  const simulated = legs.every((t) => t.is_simulated);
  const open = legs.filter((t) => t.status === "OPEN" || t.status === "PENDING").length;
  const closed = legs.filter((t) => t.status === "CLOSED").length;
  if (open > 0) return { label: `${open} open`, cls: "text-profit", simulated };
  if (closed > 0) return { label: "Closed", cls: "text-text-secondary", simulated };
  return { label: "Filled", cls: "text-text-secondary", simulated };
}

export default async function SignalsPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const db = supabase as any;

  const [{ data: signals }, { data: tradeSummary }] = await Promise.all([
    db.from("parsed_signals")
      .select("id, symbol, side, order_type, confidence, is_signal, follow_up_type, created_at, reasoning, model_used")
      .order("created_at", { ascending: false })
      .limit(100),
    db.from("trades")
      .select("parsed_signal_id, status, is_simulated")
      .order("created_at", { ascending: false })
      .limit(200),
  ]);

  const rows = (signals ?? []) as {
    id: string;
    symbol: string | null;
    side: string | null;
    order_type: string | null;
    confidence: number;
    is_signal: boolean;
    follow_up_type: string | null;
    created_at: string;
    reasoning: string;
    model_used: string;
  }[];

  const trades = (tradeSummary ?? []) as { parsed_signal_id: string; status: string; is_simulated: boolean }[];

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-xl font-semibold text-text-primary">Signals</h1>
        <p className="text-sm text-text-secondary mt-0.5">
          Every parsed message — click a row to inspect the full audit trail.
        </p>
      </div>

      {rows.length === 0 ? (
        <div className="card p-12 text-center">
          <p className="text-sm text-text-muted">No signals yet. Connect Telegram and add a channel.</p>
        </div>
      ) : (
        <div className="card overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border">
                  {["Time", "Symbol", "Side", "Type", "Confidence", "Model", "Outcome", ""].map((h) => (
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
                {rows.map((s) => {
                  const outcome = outcomeLabel(s.follow_up_type, trades, s.id);
                  return (
                    <tr
                      key={s.id}
                      className="border-b border-border last:border-0 hover:bg-surface-elevated/60 transition-colors"
                    >
                      <td className="px-4 py-2.5 text-xs text-text-muted whitespace-nowrap">
                        {tsShort(s.created_at)}
                      </td>
                      <td className="num px-4 py-2.5 font-semibold text-text-primary">
                        {s.symbol ?? <span className="text-text-muted font-normal">—</span>}
                      </td>
                      <td className="px-4 py-2.5">
                        {s.side === "BUY" ? (
                          <span className="flex items-center gap-1 text-xs font-semibold text-profit">
                            <TrendingUp size={12} /> BUY
                          </span>
                        ) : s.side === "SELL" ? (
                          <span className="flex items-center gap-1 text-xs font-semibold text-loss">
                            <TrendingDown size={12} /> SELL
                          </span>
                        ) : (
                          <span className="flex items-center gap-1 text-xs text-text-muted">
                            <Minus size={12} />
                            {s.follow_up_type ?? "—"}
                          </span>
                        )}
                      </td>
                      <td className="px-4 py-2.5 text-xs text-text-secondary">
                        {s.order_type ?? "—"}
                      </td>
                      <td className="num px-4 py-2.5">
                        <span className={`font-medium ${confidenceColor(s.confidence)}`}>
                          {Math.round(s.confidence * 100)}%
                        </span>
                      </td>
                      <td className="px-4 py-2.5 text-xs text-text-muted whitespace-nowrap">
                        {s.model_used?.includes("haiku") ? "Haiku" : s.model_used?.includes("sonnet") ? "Sonnet" : s.model_used?.includes("opus") ? "Opus" : s.model_used ?? "—"}
                      </td>
                      <td className={`num px-4 py-2.5 text-xs font-medium ${outcome.cls}`}>
                        <span className="flex items-center gap-1">
                          {outcome.simulated && <FlaskConical size={11} className="text-warning shrink-0" />}
                          {outcome.label}
                        </span>
                      </td>
                      <td className="px-4 py-2.5">
                        <Link
                          href={`/signals/${s.id}`}
                          className="flex items-center gap-1 text-xs text-primary hover:opacity-80"
                        >
                          Inspect <ArrowRight size={11} />
                        </Link>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
