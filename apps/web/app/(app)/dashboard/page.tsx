import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import Link from "next/link";
import StatCard from "@/components/ui/StatCard";
import StatusPill from "@/components/ui/StatusPill";
import { Activity, Radio, Shield, ArrowRight } from "lucide-react";
import type { Metadata } from "next";

export const metadata: Metadata = { title: "Dashboard" };
export const dynamic = "force-dynamic";

export default async function DashboardPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  // Fetch recent signals + trades for this user (via RLS)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const db = supabase as any;

  const [{ data: signals }, { data: trades }, { data: brokers }, { data: sources }] =
    await Promise.all([
      db.from("parsed_signals")
        .select("id, symbol, signal_side, created_at, confidence, is_signal")
        .order("created_at", { ascending: false })
        .limit(10),
      db.from("trades")
        .select("id, symbol, status, created_at")
        .order("created_at", { ascending: false })
        .limit(5),
      db.from("broker_connections").select("id, label, status"),
      db.from("signal_sources").select("id, title, is_active"),
    ]);

  const openTrades = (trades ?? []).filter(
    (t: { status: string }) => t.status === "OPEN" || t.status === "PENDING"
  ).length;

  const todaySignals = (signals ?? []).filter((s: { created_at: string }) => {
    const d = new Date(s.created_at);
    const now = new Date();
    return d.toDateString() === now.toDateString();
  }).length;

  const hasBroker = (brokers ?? []).length > 0;
  const hasTelegram = (sources ?? []).length > 0;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-semibold text-text-primary">Dashboard</h1>
        <p className="text-sm text-text-secondary mt-0.5">
          {user.email}
        </p>
      </div>

      {/* Setup banner — shown until both connections exist */}
      {(!hasBroker || !hasTelegram) && (
        <div className="card border-primary/20 p-4 space-y-3">
          <p className="text-sm font-medium text-text-primary">Complete your setup</p>
          <div className="space-y-2">
            {!hasTelegram && (
              <SetupStep
                done={false}
                label="Connect Telegram"
                sub="Read signals from your channels"
                href="/channels"
              />
            )}
            {!hasBroker && (
              <SetupStep
                done={false}
                label="Connect broker (MT5)"
                sub="Place trades automatically"
                href="/settings"
              />
            )}
          </div>
        </div>
      )}

      {/* Stat cards */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <StatCard label="Balance" value="—" sub="Connect broker" />
        <StatCard label="Equity" value="—" sub="Connect broker" />
        <StatCard
          label="Open Trades"
          value={String(openTrades)}
          sub={openTrades === 0 ? "None active" : undefined}
        />
        <StatCard
          label="Signals Today"
          value={String(todaySignals)}
          sub="Acted on"
        />
      </div>

      {/* Connection status */}
      <div className="card p-4">
        <p className="text-xs font-medium text-text-secondary uppercase tracking-wide mb-3">
          Connection status
        </p>
        <div className="flex flex-wrap gap-3">
          <div className="flex items-center gap-2">
            <Radio size={14} className="text-text-muted" />
            <span className="text-sm text-text-secondary">Telegram:</span>
            <StatusPill status={hasTelegram ? "connected" : "disconnected"} />
          </div>
          <div className="flex items-center gap-2">
            <Shield size={14} className="text-text-muted" />
            <span className="text-sm text-text-secondary">Broker:</span>
            <StatusPill status={hasBroker ? "connected" : "disconnected"} />
          </div>
        </div>
      </div>

      {/* Recent signals */}
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <p className="text-sm font-medium text-text-primary">Recent signals</p>
          <Link
            href="/signals"
            className="flex items-center gap-1 text-xs text-primary hover:opacity-80"
          >
            View all <ArrowRight size={12} />
          </Link>
        </div>

        {(signals ?? []).length === 0 ? (
          <div className="card p-8 text-center">
            <Activity size={24} className="mx-auto text-text-muted mb-2" />
            <p className="text-sm text-text-muted">No signals yet.</p>
            <p className="text-xs text-text-muted mt-1">
              Connect Telegram and add a channel to start copying signals.
            </p>
          </div>
        ) : (
          <div className="card overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border">
                  <th className="px-4 py-2.5 text-left text-xs font-medium uppercase tracking-wide text-text-secondary">
                    Symbol
                  </th>
                  <th className="px-4 py-2.5 text-left text-xs font-medium uppercase tracking-wide text-text-secondary">
                    Side
                  </th>
                  <th className="px-4 py-2.5 text-left text-xs font-medium uppercase tracking-wide text-text-secondary">
                    Confidence
                  </th>
                  <th className="px-4 py-2.5 text-left text-xs font-medium uppercase tracking-wide text-text-secondary hidden sm:table-cell">
                    Time
                  </th>
                </tr>
              </thead>
              <tbody>
                {(signals ?? []).slice(0, 5).map(
                  (s: { id: string; symbol: string; signal_side: string; created_at: string; confidence: number; is_signal: boolean }) => (
                    <tr key={s.id} className="border-b border-border last:border-0">
                      <td className="num px-4 py-2.5 font-medium text-text-primary">
                        {s.symbol ?? "—"}
                      </td>
                      <td className="px-4 py-2.5">
                        <span
                          className={`text-xs font-semibold ${
                            s.signal_side === "BUY" ? "text-profit" : s.signal_side === "SELL" ? "text-loss" : "text-text-muted"
                          }`}
                        >
                          {s.signal_side ?? "—"}
                        </span>
                      </td>
                      <td className="num px-4 py-2.5 text-text-secondary">
                        {s.confidence != null ? `${Math.round(s.confidence * 100)}%` : "—"}
                      </td>
                      <td className="px-4 py-2.5 text-text-muted text-xs hidden sm:table-cell">
                        {new Date(s.created_at).toLocaleTimeString([], {
                          hour: "2-digit",
                          minute: "2-digit",
                        })}
                      </td>
                    </tr>
                  )
                )}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}

function SetupStep({
  done,
  label,
  sub,
  href,
}: {
  done: boolean;
  label: string;
  sub: string;
  href: string;
}) {
  return (
    <Link
      href={href}
      className="flex items-center justify-between rounded-lg border border-border bg-surface-elevated px-3 py-2.5 hover:border-primary/30 transition-colors group"
    >
      <div className="flex items-center gap-3">
        <div
          className={`h-5 w-5 rounded-full border-2 flex items-center justify-center ${
            done ? "border-profit bg-profit/20" : "border-border"
          }`}
        >
          {done && <span className="text-profit text-xs">✓</span>}
        </div>
        <div>
          <p className="text-sm font-medium text-text-primary">{label}</p>
          <p className="text-xs text-text-muted">{sub}</p>
        </div>
      </div>
      <ArrowRight size={14} className="text-text-muted group-hover:text-primary transition-colors" />
    </Link>
  );
}
