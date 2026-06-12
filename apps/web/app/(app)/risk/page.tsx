import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import { Globe2 } from "lucide-react";
import RiskSettingsForm, { type RiskSettings } from "@/components/risk/RiskSettingsForm";
import type { Metadata } from "next";

export const metadata: Metadata = { title: "Risk Settings" };
export const dynamic = "force-dynamic";

const DEFAULTS: RiskSettings = {
  execution_mode:        "apply_my_rules",
  mirror_lot_mode:       "risk_based",
  mirror_allow_no_sl:    false,
  sizing_mode:           "percent_balance",
  risk_per_trade_pct:    0.5,
  fixed_lot_size:        null,
  fixed_usd_risk:        null,
  daily_signal_limit:    0,
  max_trades_per_day:    null,
  daily_loss_cap_pct:    null,
  daily_loss_cap_action: "pause",
  default_sl_policy:     "skip",
  default_sl_pips:       null,
  breakeven_after_tp1:   false,
  trailing_after_tp2:    false,
  news_filter_enabled:   false,
  news_filter_window_min: 60,
};

export default async function RiskPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const db = supabase as any;

  const [{ data }, { data: broker }] = await Promise.all([
    db.from("risk_settings").select("*").eq("user_id", user.id).maybeSingle(),
    db.from("broker_connections")
      .select("label, platform, last_balance_usd")
      .order("created_at", { ascending: true })
      .limit(1)
      .maybeSingle(),
  ]);

  const initial: RiskSettings = data
    ? {
        execution_mode:        data.execution_mode        ?? DEFAULTS.execution_mode,
        mirror_lot_mode:       data.mirror_lot_mode       ?? DEFAULTS.mirror_lot_mode,
        mirror_allow_no_sl:    data.mirror_allow_no_sl    ?? false,
        sizing_mode:           data.sizing_mode           ?? DEFAULTS.sizing_mode,
        risk_per_trade_pct:    data.risk_per_trade_pct    ?? DEFAULTS.risk_per_trade_pct,
        fixed_lot_size:        data.fixed_lot_size        ?? null,
        fixed_usd_risk:        data.fixed_usd_risk        ?? null,
        daily_signal_limit:    data.daily_signal_limit    ?? 0,
        max_trades_per_day:    data.max_trades_per_day    ?? null,
        daily_loss_cap_pct:    data.daily_loss_cap_pct    ?? null,
        daily_loss_cap_action: data.daily_loss_cap_action ?? DEFAULTS.daily_loss_cap_action,
        default_sl_policy:     data.default_sl_policy     ?? DEFAULTS.default_sl_policy,
        default_sl_pips:       data.default_sl_pips       ?? null,
        breakeven_after_tp1:   data.breakeven_after_tp1   ?? false,
        trailing_after_tp2:    data.trailing_after_tp2    ?? false,
        news_filter_enabled:   data.news_filter_enabled   ?? false,
        news_filter_window_min: data.news_filter_window_min ?? 60,
      }
    : DEFAULTS;

  const brokerRow = broker as { label: string | null; last_balance_usd: number | null } | null;

  return (
    <div className="mx-auto w-full max-w-[920px]">
      <div className="mb-5 flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h1 className="text-[20px] font-bold tracking-tight text-text-primary sm:text-[22px]">Risk settings</h1>
          <p className="mt-1 max-w-xl text-[13px] leading-relaxed text-text-secondary">
            Your global rulebook. These defaults apply to every channel unless it overrides them.
            VouchFX never opens a trade that breaks these limits.
          </p>
        </div>
        <span className="inline-flex shrink-0 items-center gap-1.5 rounded-full border border-primary/30 bg-primary/10 px-3 py-1.5 text-xs font-medium text-primary-light">
          <Globe2 size={13} /> Global rules
        </span>
      </div>

      <RiskSettingsForm
        initial={initial}
        balance={brokerRow?.last_balance_usd ?? null}
        brokerLabel={brokerRow?.label ?? null}
      />
    </div>
  );
}
