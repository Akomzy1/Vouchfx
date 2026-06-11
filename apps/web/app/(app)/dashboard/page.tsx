import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import Link from "next/link";
import StatCard from "@/components/ui/StatCard";
import StatusPill from "@/components/ui/StatusPill";
import OpenPositions from "@/components/dashboard/OpenPositions";
import ActivityFeed from "@/components/dashboard/ActivityFeed";
import EquitySparkline from "@/components/dashboard/EquitySparkline";
import { Activity, Radio, Shield, ArrowRight, AlertTriangle } from "lucide-react";
import type { Metadata } from "next";

export const metadata: Metadata = { title: "Dashboard" };
export const dynamic = "force-dynamic";

function fmtCcy(n: number | null, currency = "USD"): string {
  if (n == null) return "—";
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency,
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(n);
}

function syncAge(iso: string | null): string {
  if (!iso) return "never synced";
  const m = Math.floor((Date.now() - new Date(iso).getTime()) / 60_000);
  if (m < 1) return "just now";
  if (m < 60) return `${m}m ago`;
  return `${Math.floor(m / 60)}h ago`;
}

export default async function DashboardPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const db = supabase as any;

  // Redirect new users to onboarding wizard
  const { data: userMeta } = await db
    .from("users")
    .select("onboarding_completed_at")
    .eq("id", user.id)
    .single();
  if (!(userMeta as { onboarding_completed_at: string | null } | null)?.onboarding_completed_at) {
    redirect("/onboarding");
  }

  const todayStart = new Date();
  todayStart.setUTCHours(0, 0, 0, 0);
  const todayISO = todayStart.toISOString();

  const [
    { data: brokers },
    { data: sources },
    { data: openTrades },
    { data: recentEvents },
    { data: sparkRaw },
    { data: todayTradeRows },
    { data: riskRow },
  ] = await Promise.all([
    db.from("broker_connections")
      .select("id, label, is_active, platform, last_balance_usd, last_equity_usd, last_synced_at")
      .order("created_at", { ascending: true }),
    db.from("signal_sources").select("id, title, is_enabled"),
    db.from("trades")
      .select("id, symbol, side, volume, entry_price, sl, tp, status, opened_at, created_at")
      .in("status", ["OPEN", "PENDING"])
      .order("created_at", { ascending: false })
      .limit(20),
    db.from("audit_events")
      .select("id, event_type, payload, created_at")
      .in("event_type", ["executed", "skipped", "cancelled", "closed", "modified", "error"])
      .order("created_at", { ascending: false })
      .limit(12),
    // Balance sparkline: last 50 executed events with account_balance in payload
    db.from("audit_events")
      .select("created_at, payload")
      .eq("event_type", "executed")
      .gte("created_at", new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString())
      .order("created_at", { ascending: true })
      .limit(50),
    // Signals acted on today (distinct parsed_signal_id from trades)
    db.from("trades")
      .select("parsed_signal_id")
      .neq("status", "SKIPPED")
      .gte("created_at", todayISO),
    db.from("risk_settings").select("daily_signal_limit").eq("user_id", user.id).maybeSingle(),
  ]);

  // ── Derived stats ──────────────────────────────────────────────────────────
  const primaryBroker = (brokers ?? [])[0] as {
    id: string;
    label: string | null;
    is_active: boolean;
    platform: string;
    last_balance_usd: number | null;
    last_equity_usd: number | null;
    last_synced_at: string | null;
  } | undefined;

  const balance = primaryBroker?.last_balance_usd ?? null;
  const equity = primaryBroker?.last_equity_usd ?? null;
  const floatingPnl = balance != null && equity != null ? equity - balance : null;
  const hasBroker = (brokers ?? []).length > 0;
  const hasTelegram = (sources ?? []).length > 0;

  // Signals today: count distinct parsed_signal_id
  const signalsTodayCount = new Set(
    ((todayTradeRows ?? []) as { parsed_signal_id: string }[]).map((r) => r.parsed_signal_id)
  ).size;
  const signalDailyLimit: number = (riskRow as { daily_signal_limit?: number } | null)?.daily_signal_limit ?? 0;

  // Sparkline data from audit_events payload.account_balance
  const sparklineData = ((sparkRaw ?? []) as { created_at: string; payload: Record<string, unknown> | null }[])
    .filter((r) => r.payload && typeof r.payload.account_balance === "number")
    .map((r) => ({
      time: r.created_at,
      balance: r.payload!.account_balance as number,
    }));

  // If no spark data but we have a current balance, seed with one point
  if (sparklineData.length === 0 && balance != null) {
    sparklineData.push({ time: new Date().toISOString(), balance });
  }

  const pnlPositive = floatingPnl != null && floatingPnl > 0;
  const pnlNegative = floatingPnl != null && floatingPnl < 0;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold text-text-primary">Dashboard</h1>
          <p className="text-sm text-text-secondary mt-0.5">{user.email}</p>
        </div>
        {primaryBroker?.last_synced_at && (
          <p className="text-xs text-text-muted hidden sm:block">
            Synced {syncAge(primaryBroker.last_synced_at)}
          </p>
        )}
      </div>

      {/* Setup banner */}
      {(!hasBroker || !hasTelegram) && (
        <div className="card border border-primary/20 p-4 space-y-3">
          <p className="text-sm font-medium text-text-primary">Complete your setup</p>
          <div className="space-y-2">
            {!hasTelegram && (
              <SetupStep
                label="Connect Telegram"
                sub="Read signals from your channels"
                href="/channels"
              />
            )}
            {!hasBroker && (
              <SetupStep
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
        <StatCard
          label="Balance"
          value={fmtCcy(balance)}
          sub={balance == null ? "Connect broker" : undefined}
        />
        <StatCard
          label="Equity"
          value={fmtCcy(equity)}
          sub={equity == null ? "Connect broker" : undefined}
        />
        <StatCard
          label="Floating P&L"
          value={fmtCcy(floatingPnl)}
          deltaPositive={pnlPositive}
          delta={
            floatingPnl != null
              ? `${pnlPositive ? "+" : ""}${fmtCcy(floatingPnl)}`
              : undefined
          }
          sub={floatingPnl == null ? "Unrealized" : undefined}
        />
        <StatCard
          label="Open Trades"
          value={String((openTrades ?? []).length)}
          sub={
            signalDailyLimit > 0
              ? `Signals today: ${signalsTodayCount} / ${signalDailyLimit}`
              : `Signals today: ${signalsTodayCount}`
          }
        />
      </div>

      {/* Status banners */}
      <div className="card p-4">
        <p className="text-xs font-medium text-text-secondary uppercase tracking-wide mb-3">
          Connection status
        </p>
        <div className="flex flex-wrap gap-4">
          <div className="flex items-center gap-2">
            <Radio size={14} className="text-text-muted" />
            <span className="text-sm text-text-secondary">Telegram</span>
            <StatusPill status={hasTelegram ? "connected" : "disconnected"} />
          </div>
          <div className="flex items-center gap-2">
            <Shield size={14} className="text-text-muted" />
            <span className="text-sm text-text-secondary">Broker</span>
            <StatusPill status={hasBroker ? "connected" : "disconnected"} />
            {primaryBroker?.label && (
              <span className="text-xs text-text-muted">{primaryBroker.label}</span>
            )}
          </div>
        </div>
      </div>

      {/* Open positions + sparkline */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        {/* Open positions — takes 2/3 width on large */}
        <div className="lg:col-span-2 space-y-2">
          <div className="flex items-center justify-between">
            <p className="text-sm font-medium text-text-primary">Open positions</p>
            <Link
              href="/signals"
              className="flex items-center gap-1 text-xs text-primary hover:opacity-80"
            >
              All signals <ArrowRight size={12} />
            </Link>
          </div>
          <OpenPositions
            initialTrades={
              (openTrades ?? []) as Parameters<typeof OpenPositions>[0]["initialTrades"]
            }
            userId={user.id}
          />
        </div>

        {/* Equity sparkline — takes 1/3 width on large */}
        <div className="space-y-2">
          <p className="text-sm font-medium text-text-primary">Balance (24h)</p>
          <div className="card p-4 h-36">
            {balance != null && (
              <p className="num text-lg font-bold text-text-primary tabular-nums mb-2">
                {fmtCcy(balance)}
              </p>
            )}
            <div className="h-20">
              <EquitySparkline data={sparklineData} currency="USD" />
            </div>
          </div>
        </div>
      </div>

      {/* Activity feed */}
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <p className="text-sm font-medium text-text-primary">Recent activity</p>
          <Link
            href="/signals"
            className="flex items-center gap-1 text-xs text-primary hover:opacity-80"
          >
            View all <ArrowRight size={12} />
          </Link>
        </div>

        {(recentEvents ?? []).length === 0 ? (
          <div className="card p-8 text-center">
            <Activity size={24} className="mx-auto text-text-muted mb-2" />
            <p className="text-sm text-text-muted">No activity yet.</p>
            <p className="text-xs text-text-muted mt-1">
              Connect Telegram and add a channel to start copying signals.
            </p>
          </div>
        ) : (
          <div className="card overflow-hidden">
            <ActivityFeed
              events={
                (recentEvents ?? []) as Parameters<typeof ActivityFeed>[0]["events"]
              }
            />
          </div>
        )}
      </div>
    </div>
  );
}

function SetupStep({ label, sub, href }: { label: string; sub: string; href: string }) {
  return (
    <Link
      href={href}
      className="flex items-center justify-between rounded-lg border border-border bg-surface-elevated px-3 py-2.5 hover:border-primary/30 transition-colors group"
    >
      <div className="flex items-center gap-3">
        <div className="h-5 w-5 rounded-full border-2 border-border flex items-center justify-center" />
        <div>
          <p className="text-sm font-medium text-text-primary">{label}</p>
          <p className="text-xs text-text-muted">{sub}</p>
        </div>
      </div>
      <ArrowRight size={14} className="text-text-muted group-hover:text-primary transition-colors" />
    </Link>
  );
}
