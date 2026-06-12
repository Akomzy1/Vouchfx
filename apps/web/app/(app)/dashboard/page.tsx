import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import Link from "next/link";
import OpenPositions from "@/components/dashboard/OpenPositions";
import ActivityFeed from "@/components/dashboard/ActivityFeed";
import EquitySparkline from "@/components/dashboard/EquitySparkline";
import ConnectionBanner from "@/components/dashboard/ConnectionBanner";
import {
  Wallet,
  TrendingUp,
  ArrowUpRight,
  Layers,
  Zap,
  Lock,
  CandlestickChart,
  Activity,
  ArrowRight,
} from "lucide-react";
import type { Metadata } from "next";

export const metadata: Metadata = { title: "Dashboard" };
export const dynamic = "force-dynamic";

function fmtCcy(n: number | null): string {
  if (n == null) return "—";
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(n);
}

function fmtSigned(n: number): string {
  const s = n < 0 ? "-" : "+";
  return `${s}$${Math.abs(n).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function greeting(): string {
  const h = new Date().getHours();
  if (h < 12) return "Good morning";
  if (h < 17) return "Good afternoon";
  return "Good evening";
}

function dateChip(): string {
  const now = new Date();
  const date = now.toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short" });
  const time = now.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" });
  return `${date} · ${time}`;
}

/* ── Prototype-style primitives ── */

function StatCard({
  label,
  icon: Icon,
  value,
  tone = "ink",
  sub,
  children,
  span,
}: {
  label: string;
  icon: React.ElementType;
  value: React.ReactNode;
  tone?: "ink" | "profit" | "loss" | "teal";
  sub?: React.ReactNode;
  children?: React.ReactNode;
  span?: string;
}) {
  const valueColor = {
    ink: "text-text-primary",
    profit: "text-profit",
    loss: "text-loss",
    teal: "text-primary-light",
  }[tone];
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

function Panel({
  title,
  icon: Icon,
  action,
  children,
  className = "",
  bodyClass = "p-4 sm:p-5",
}: {
  title: string;
  icon: React.ElementType;
  action?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
  bodyClass?: string;
}) {
  return (
    <section className={`rounded-2xl border border-border bg-surface ${className}`}>
      <div className="flex items-center justify-between gap-3 border-b border-border px-4 py-3.5 sm:px-5">
        <div className="flex items-center gap-2">
          <Icon size={16} className="text-primary-light" />
          <h2 className="text-[14px] font-semibold text-text-primary">{title}</h2>
        </div>
        {action}
      </div>
      <div className={bodyClass}>{children}</div>
    </section>
  );
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
    .select("onboarding_completed_at, full_name")
    .eq("id", user.id)
    .single();
  const userRow = userMeta as { onboarding_completed_at: string | null; full_name: string | null } | null;
  if (!userRow?.onboarding_completed_at) {
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
      .select("id, label, is_active, status, platform, last_balance_usd, last_equity_usd, last_synced_at")
      .order("is_primary", { ascending: false })
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
      .limit(8),
    db.from("audit_events")
      .select("created_at, payload")
      .eq("event_type", "executed")
      .gte("created_at", new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString())
      .order("created_at", { ascending: true })
      .limit(50),
    db.from("trades")
      .select("parsed_signal_id")
      .neq("status", "SKIPPED")
      .gte("created_at", todayISO),
    db.from("risk_settings").select("daily_signal_limit").eq("user_id", user.id).maybeSingle(),
  ]);

  // ── Derived stats ──────────────────────────────────────────────────────────
  const primaryBroker = (brokers ?? [])[0] as
    | {
        id: string;
        label: string | null;
        is_active: boolean;
        status: string | null;
        last_balance_usd: number | null;
        last_equity_usd: number | null;
        last_synced_at: string | null;
      }
    | undefined;

  const balance = primaryBroker?.last_balance_usd ?? null;
  const equity = primaryBroker?.last_equity_usd ?? null;
  const floatingPnl = balance != null && equity != null ? equity - balance : null;
  const hasBroker = (brokers ?? []).length > 0;
  const hasTelegram = (sources ?? []).length > 0;
  const brokerOk = !!primaryBroker && (primaryBroker.status === "connected" || primaryBroker.is_active);

  const signalsTodayCount = new Set(
    ((todayTradeRows ?? []) as { parsed_signal_id: string }[]).map((r) => r.parsed_signal_id)
  ).size;
  const signalDailyLimit: number =
    (riskRow as { daily_signal_limit?: number } | null)?.daily_signal_limit ?? 0;
  const limitPct =
    signalDailyLimit > 0 ? Math.min(100, Math.round((signalsTodayCount / signalDailyLimit) * 100)) : 0;

  const sparklineData = ((sparkRaw ?? []) as { created_at: string; payload: Record<string, unknown> | null }[])
    .filter((r) => r.payload && typeof r.payload.account_balance === "number")
    .map((r) => ({ time: r.created_at, balance: r.payload!.account_balance as number }));
  if (sparklineData.length === 0 && balance != null) {
    sparklineData.push({ time: new Date().toISOString(), balance });
  }

  const openCount = (openTrades ?? []).length;
  // Greet by first name: users.full_name → auth metadata (Google) → email prefix
  const fullName = (
    userRow?.full_name ??
    (user.user_metadata?.full_name as string | undefined) ??
    (user.user_metadata?.name as string | undefined) ??
    ""
  ).trim();
  const name = fullName ? fullName.split(/\s+/)[0]! : ((user.email ?? "").split("@")[0] ?? "");
  const displayName = name.charAt(0).toUpperCase() + name.slice(1);

  const pnlTone = floatingPnl == null ? "ink" : floatingPnl >= 0 ? "profit" : "loss";

  return (
    <div>
      {/* Setup banner for incomplete accounts; status banner otherwise */}
      {!hasBroker || !hasTelegram ? (
        <div className="mb-5 rounded-2xl border border-primary/20 bg-surface p-4 space-y-3">
          <p className="text-sm font-medium text-text-primary">Complete your setup</p>
          <div className="space-y-2">
            {!hasTelegram && (
              <SetupStep label="Connect Telegram" sub="Read signals from your channels" href="/channels" />
            )}
            {!hasBroker && (
              <SetupStep label="Connect broker (MT5)" sub="Place trades automatically" href="/settings" />
            )}
          </div>
        </div>
      ) : (
        <ConnectionBanner brokerOk={brokerOk} telegramOk={hasTelegram} brokerLabel={primaryBroker?.label} />
      )}

      {/* Greeting */}
      <div className="mb-5 flex items-end justify-between gap-3">
        <div>
          <h1 className="text-[20px] font-bold tracking-tight text-text-primary sm:text-[22px]">
            {greeting()}, {displayName}
          </h1>
          <p className="mt-0.5 text-[13px] text-text-secondary">
            Here&rsquo;s how your copied trades are doing today.
          </p>
        </div>
        <span className="num hidden shrink-0 items-center gap-1.5 rounded-lg border border-border bg-surface px-2.5 py-1.5 text-[12px] text-text-secondary sm:inline-flex">
          <span className={`live-dot h-1.5 w-1.5 rounded-full ${brokerOk ? "bg-profit" : "bg-loss"}`} />
          {dateChip()}
        </span>
      </div>

      {/* Stat cards */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-5">
        <StatCard
          label="Account balance"
          icon={Wallet}
          value={fmtCcy(balance)}
          sub={
            <span className="flex items-center gap-1 text-text-muted">
              <Lock size={11} /> Realized
            </span>
          }
        />

        <StatCard label="Equity" icon={TrendingUp} value={fmtCcy(equity)} span="col-span-2 sm:col-span-1">
          <div className="mt-2 h-[42px] w-full">
            <EquitySparkline data={sparklineData} currency="USD" />
          </div>
        </StatCard>

        <StatCard
          label="Today's P&L"
          icon={ArrowUpRight}
          value={floatingPnl != null ? fmtSigned(floatingPnl) : "—"}
          tone={pnlTone as "ink" | "profit" | "loss"}
          sub={
            floatingPnl != null ? (
              <span className={floatingPnl >= 0 ? "text-profit" : "text-loss"}>
                Unrealized · {openCount} trade{openCount !== 1 ? "s" : ""}
              </span>
            ) : (
              "Unrealized"
            )
          }
        />

        <StatCard
          label="Open trades"
          icon={Layers}
          value={String(openCount)}
          sub={
            <span className="flex items-center gap-1 text-text-muted">
              <span className={`h-1.5 w-1.5 rounded-full ${brokerOk ? "live-dot bg-profit" : "bg-loss"}`} />
              {brokerOk ? "Executing" : "Queued"}
            </span>
          }
        />

        <StatCard
          label="Signals today"
          icon={Zap}
          tone="teal"
          value={
            signalDailyLimit > 0 ? (
              <span>
                {signalsTodayCount} <span className="text-base text-text-muted">/ {signalDailyLimit}</span>
              </span>
            ) : (
              String(signalsTodayCount)
            )
          }
        >
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

      {/* Panels */}
      <div className="mt-5 grid grid-cols-1 gap-5 xl:grid-cols-[1.65fr_1fr]">
        <Panel
          title="Open positions"
          icon={CandlestickChart}
          bodyClass="p-3 sm:p-4"
          className="min-w-0"
          action={
            <span className="num inline-flex items-center gap-1.5 rounded-full border border-border bg-bg/50 px-2.5 py-1 text-[11px] text-text-secondary">
              <span className={`h-1.5 w-1.5 rounded-full ${brokerOk ? "live-dot bg-profit" : "bg-loss"}`} />
              {brokerOk ? "Live" : "Frozen"}
            </span>
          }
        >
          <OpenPositions
            initialTrades={(openTrades ?? []) as Parameters<typeof OpenPositions>[0]["initialTrades"]}
            userId={user.id}
          />
        </Panel>

        <Panel
          title="Recent activity"
          icon={Activity}
          bodyClass="p-2 sm:p-2.5"
          className="min-w-0"
          action={
            <Link href="/signals" className="text-[12px] font-medium text-primary-light transition-colors hover:text-primary">
              View all
            </Link>
          }
        >
          <ActivityFeed events={(recentEvents ?? []) as Parameters<typeof ActivityFeed>[0]["events"]} />
        </Panel>
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
