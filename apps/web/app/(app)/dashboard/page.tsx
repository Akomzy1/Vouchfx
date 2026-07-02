import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import Link from "next/link";
import OpenPositions from "@/components/dashboard/OpenPositions";
import ActivityFeed from "@/components/dashboard/ActivityFeed";
import ConnectionBanner from "@/components/dashboard/ConnectionBanner";
import AccountSummary, { type ModeAggregate } from "@/components/dashboard/AccountSummary";
import { CandlestickChart, Activity, ArrowRight } from "lucide-react";
import type { Metadata } from "next";

export const metadata: Metadata = { title: "Dashboard" };
export const dynamic = "force-dynamic";

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
      .select("id, label, is_active, is_primary, copy_enabled, account_mode, status, platform, last_balance_usd, last_equity_usd, last_synced_at, today_realized_pnl_usd, today_pnl_date")
      .order("is_primary", { ascending: false })
      .order("created_at", { ascending: true }),
    db.from("signal_sources").select("id, title, is_enabled"),
    db.from("trades")
      .select("id, broker_connection_id, symbol, side, volume, entry_price, sl, tp, status, opened_at, created_at")
      .in("status", ["OPEN", "PENDING"])
      .order("created_at", { ascending: false })
      .limit(20),
    db.from("audit_events")
      .select("id, event_type, parsed_signal_id, payload, created_at")
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
  type BrokerRow = {
    id: string;
    label: string | null;
    is_active: boolean;
    copy_enabled: boolean;
    account_mode: "demo" | "live" | null;
    status: string | null;
    last_balance_usd: number | null;
    last_equity_usd: number | null;
    today_realized_pnl_usd: number | null;
    today_pnl_date: string | null;
  };
  const allBrokers = (brokers ?? []) as BrokerRow[];
  const primaryBroker = allBrokers[0];

  const hasBroker = allBrokers.length > 0;
  const hasTelegram = (sources ?? []).length > 0;

  // Accounts a signal currently copies to (VCH-BRK-04). Money figures aggregate
  // these, split by mode so demo and live are never blended.
  const copyAccts = allBrokers.filter((b) => b.is_active && b.copy_enabled);
  const copyIds = new Set(copyAccts.map((b) => b.id));
  const accountMap: Record<string, { label: string; mode: "demo" | "live" | null }> = Object.fromEntries(
    copyAccts.map((b) => [b.id, { label: b.label ?? "MT5 account", mode: b.account_mode }])
  );
  const brokerOk = copyAccts.some((b) => b.status === "connected" || b.is_active);

  const todayUtc = new Date().toISOString().slice(0, 10);
  function aggregate(mode: "live" | "demo"): ModeAggregate | null {
    const accts = copyAccts.filter((b) => b.account_mode === mode);
    if (accts.length === 0) return null;
    let balSum = 0, balHas = false, eqSum = 0, eqHas = false, today = 0;
    for (const a of accts) {
      if (a.last_balance_usd != null) { balSum += Number(a.last_balance_usd); balHas = true; }
      if (a.last_equity_usd != null) { eqSum += Number(a.last_equity_usd); eqHas = true; }
      // Only trust today's cached P&L when the cache is actually dated today.
      if (a.today_pnl_date === todayUtc) today += Number(a.today_realized_pnl_usd ?? 0);
    }
    const balance = balHas ? balSum : null;
    const equity = eqHas ? eqSum : null;
    return {
      balance,
      equity,
      floating: balance != null && equity != null ? equity - balance : null,
      todayPnl: today,
      accountCount: accts.length,
    };
  }
  const liveAgg = aggregate("live");
  const demoAgg = aggregate("demo");

  // Open trades across copy-enabled accounts (a count — safe across modes).
  const openAccountIds = copyIds.size > 0 ? [...copyIds] : null;
  const initialOpenTrades = ((openTrades ?? []) as Array<{ broker_connection_id: string }>).filter(
    (t) => !openAccountIds || openAccountIds.includes(t.broker_connection_id)
  ) as Parameters<typeof OpenPositions>[0]["initialTrades"];
  const openCount = initialOpenTrades.length;

  const signalsTodayCount = new Set(
    ((todayTradeRows ?? []) as { parsed_signal_id: string }[]).map((r) => r.parsed_signal_id)
  ).size;
  const signalDailyLimit: number =
    (riskRow as { daily_signal_limit?: number } | null)?.daily_signal_limit ?? 0;

  const sparklineData = ((sparkRaw ?? []) as { created_at: string; payload: Record<string, unknown> | null }[])
    .filter((r) => r.payload && typeof r.payload.account_balance === "number")
    .map((r) => ({ time: r.created_at, balance: r.payload!.account_balance as number }));
  const anyBalance = liveAgg?.balance ?? demoAgg?.balance ?? null;
  if (sparklineData.length === 0 && anyBalance != null) {
    sparklineData.push({ time: new Date().toISOString(), balance: anyBalance });
  }

  // Greet by first name: users.full_name → auth metadata (Google) → email prefix
  const fullName = (
    userRow?.full_name ??
    (user.user_metadata?.full_name as string | undefined) ??
    (user.user_metadata?.name as string | undefined) ??
    ""
  ).trim();
  const name = fullName ? fullName.split(/\s+/)[0]! : ((user.email ?? "").split("@")[0] ?? "");
  const displayName = name.charAt(0).toUpperCase() + name.slice(1);

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

      {/* Stat cards — aggregated across the accounts you're copying to. */}
      <AccountSummary
        live={liveAgg}
        demo={demoAgg}
        openCount={openCount}
        brokerOk={brokerOk}
        sparklineData={sparklineData}
        signalsTodayCount={signalsTodayCount}
        signalDailyLimit={signalDailyLimit}
      />

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
            initialTrades={initialOpenTrades}
            userId={user.id}
            accountIds={openAccountIds}
            accounts={accountMap}
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
