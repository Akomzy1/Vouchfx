import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import PropModeClient from "@/components/prop/PropModeClient";
import { canUsePropMode } from "@vouchfx/core";
import { Shield } from "lucide-react";
import type { Metadata } from "next";
import type { Plan } from "@vouchfx/core";

export const metadata: Metadata = { title: "Prop Mode" };
export const dynamic = "force-dynamic";

export default async function PropPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const db = supabase as any;

  // ── Plan gate ────────────────────────────────────────────────────────────────
  const { data: subRow } = await db
    .from("subscriptions")
    .select("plan")
    .eq("user_id", user.id)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle() as { data: { plan: Plan } | null };

  const currentPlan: Plan = subRow?.plan ?? "trial";

  if (!canUsePropMode(currentPlan)) {
    return (
      <div className="max-w-lg mx-auto mt-12 space-y-6 text-center">
        <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-surface-elevated border border-border mx-auto">
          <Shield size={24} className="text-text-muted" />
        </div>
        <div>
          <h2 className="text-lg font-semibold text-text-primary">
            Prop Mode requires the Funded plan
          </h2>
          <p className="text-sm text-text-secondary mt-2 max-w-sm mx-auto">
            Upgrade to Funded ($79/mo) to access the full Prop Mode rule engine —
            real-time enforcement of drawdown limits, consistency guardrails,
            equity guardian, and the Rule Monitor.
          </p>
        </div>
        <div className="flex items-center justify-center gap-3">
          <a
            href="/billing"
            className="rounded-lg bg-primary px-5 py-2.5 text-sm font-medium text-white hover:opacity-90"
          >
            View plans
          </a>
          <a
            href="/dashboard"
            className="rounded-lg border border-border px-5 py-2.5 text-sm font-medium text-text-secondary hover:text-text-primary"
          >
            Back to dashboard
          </a>
        </div>
      </div>
    );
  }

  const dayMinus30 = new Date();
  dayMinus30.setUTCDate(dayMinus30.getUTCDate() - 30);
  const since = dayMinus30.toISOString().slice(0, 10);

  const [
    { data: brokers },
    { data: profiles },
    { data: firms },
  ] = await Promise.all([
    db.from("broker_connections")
      .select("id, label, last_balance_usd, last_equity_usd, last_synced_at")
      .order("created_at", { ascending: true }),
    db.from("prop_account_profiles")
      .select(`
        id, broker_connection_id, enabled, stealth_config, challenge_start_balance_usd,
        ruleset_id,
        prop_rulesets(
          id, challenge_name, version, status,
          daily_loss_pct, daily_loss_basis, max_drawdown_pct, max_drawdown_model,
          consistency_pct, news_before_min, news_after_min,
          weekend_holding_allowed, min_trading_days, copy_trading_permitted, verified_at,
          prop_firms(id, name, slug)
        )
      `)
      .order("created_at", { ascending: true }),
    db.from("prop_firms")
      .select(`
        id, name, slug,
        prop_rulesets(
          id, challenge_name, daily_loss_pct, daily_loss_basis, max_drawdown_pct,
          max_drawdown_model, consistency_pct, news_before_min, news_after_min,
          weekend_holding_allowed, min_trading_days, copy_trading_permitted, verified_at
        )
      `)
      .eq("active", true)
      // Only include firms that have at least one published/current ruleset
      .order("name", { ascending: true }),
  ]);

  const brokerIds: string[] = ((profiles ?? []) as { broker_connection_id: string }[])
    .map((p) => p.broker_connection_id);

  const [{ data: equityStates }, { data: dailyPnl }] = await Promise.all([
    brokerIds.length > 0
      ? db.from("prop_equity_state").select("*").in("broker_connection_id", brokerIds)
      : Promise.resolve({ data: [] }),
    brokerIds.length > 0
      ? db.from("prop_daily_pnl")
          .select("broker_connection_id, day_key, realized_pnl_usd")
          .in("broker_connection_id", brokerIds)
          .gte("day_key", since)
          .order("day_key", { ascending: true })
      : Promise.resolve({ data: [] }),
  ]);

  return (
    <PropModeClient
      userId={user.id}
      brokers={brokers ?? []}
      profiles={profiles ?? []}
      firms={firms ?? []}
      equityStates={equityStates ?? []}
      dailyPnl={dailyPnl ?? []}
    />
  );
}
